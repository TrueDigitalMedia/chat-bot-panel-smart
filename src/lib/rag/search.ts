import { generateObject } from 'ai'
import { z } from 'zod'
import { sql } from '@/lib/db/client'
import { chatModel, CHAT_MODEL_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'
import { SURVEY_QUESTIONS } from '@/lib/conversation/survey-questions'

export interface FAQEntry {
  id: string
  question: string
  answer: string
  category: string | null
}

/** Real button labels from Q2 (country) — single source of truth, never hand-copied. */
const ENABLED_COUNTRIES = (SURVEY_QUESTIONS.find((q) => q.fieldName === 'country')?.buttons ?? [])
  .flat()
  .map((b) => b.text)
  .join(', ')

/**
 * Grounds the model in what the bot/flow actually is and does, beyond just the FAQ
 * text — without this, a question like "¿sirve en México?" only gets answered if
 * some FAQ happens to mention that exact word, forcing a new FAQ row per variant
 * (country name, phrasing, etc.) instead of the model reasoning from real context.
 */
const BOT_CONTEXT = `PanelSmart es una plataforma de investigación de mercados (Kantar) donde las personas registran sus compras del hogar desde una app móvil y ganan puntos canjeables por premios. Este chatbot es el paso de reclutamiento: encuesta al usuario (términos y condiciones, si le interesa ganar premios, si administra las compras del hogar, datos demográficos), verifica si hay cupo disponible para su perfil, y si califica le pide descargar la app PanelSmart y activarla con un código de registro. Países habilitados actualmente: ${ENABLED_COUNTRIES}. Cualquier otro país no está soportado.`

const MATCH_SCHEMA = z.object({
  reasoning: z
    .string()
    .describe(
      'Explica en una frase qué necesita saber el usuario, y si alguna FAQ realmente responde eso — no si solo comparte palabras o tema.',
    ),
  matchedIndex: z
    .number()
    .int()
    .nullable()
    .describe('Índice (0-based) de la FAQ que responde genuinamente el mensaje, o null si ninguna aplica'),
})

/**
 * Matches a user's out-of-flow message against the FAQ set. Only ~25 entries exist
 * (small enough to hand the whole list to the model), so this asks an LLM to judge
 * relevance directly instead of ranking by embedding-cosine-similarity — a fixed
 * similarity threshold either missed legitimate paraphrases scoring well below it
 * (e.g. "de que sirve esta inscripcion" scored 0.28 against the FAQ that actually
 * answers it) or let through topically-adjacent wrong matches that scored higher
 * than the correct one (e.g. "donde bajo la app" ranked "¿Necesito internet...?"
 * above the actually-correct "¿Dónde descargo Panel Smart?"). The embedding column
 * on faq_entries is left in place for a future scale-up, just unused here for now.
 */
export async function findFaq(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<FAQEntry | null> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const candidates = (await sql`
      SELECT id, question, answer, category FROM faq_entries ORDER BY question
    `) as FAQEntry[]
    if (candidates.length === 0) return null

    const prompt = `Contexto sobre el bot y el flujo actual (úsalo para entender la intención real del usuario, incluso si la pregunta usa palabras distintas a las de las FAQs):
${BOT_CONTEXT}

Un usuario escribió este mensaje en lugar de responder la pregunta que el bot le hizo:

"${sanitized}"

Estas son las preguntas frecuentes disponibles, con su respuesta completa:
${candidates.map((c, i) => `${i}. P: ${c.question}\n   R: ${c.answer}`).join('\n')}

Elige el índice de la FAQ solo si su RESPUESTA de verdad resuelve lo que el usuario necesita saber, usando el contexto de arriba para interpretar variantes (otro país no listado, otra forma de preguntar lo mismo, etc.) — no basta con que compartan una palabra o tema general. Por ejemplo, "puedo elegir México" pregunta por disponibilidad geográfica, y NO lo responde una FAQ sobre criterios de selección de panelistas, aunque ambas mencionen "elegir/selección". Si ninguna respuesta contesta genuinamente lo que preguntó, responde null — es preferible no responder a responder con la FAQ equivocada.`

    const result = await generateObject({ model: chatModel(), schema: MATCH_SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'faq_search',
      model: CHAT_MODEL_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    const idx = result.object.matchedIndex
    if (idx === null || idx < 0 || idx >= candidates.length) return null
    return candidates[idx]
  } catch (err) {
    if (err instanceof InputRejectedError) return null
    await logCall({
      leadId: opts?.leadId,
      callType: 'faq_search',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return null
  }
}
