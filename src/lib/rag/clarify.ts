import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'
import { BOT_CONTEXT } from './search'
import type { RecentMessage } from '@/lib/db/conversation-messages'

const CLARIFY_SCHEMA = z.object({
  canAnswer: z
    .boolean()
    .describe('true solo si puedes responder la duda del usuario con confianza usando el contexto disponible'),
  answer: z
    .string()
    .nullable()
    .describe('Respuesta breve (1-3 frases), en español, tono cercano. null si canAnswer es false.'),
})

/**
 * Last-resort fallback when a free-text message at a decision point or button question
 * doesn't match any button AND doesn't match a seeded FAQ (findFaq returned null) —
 * e.g. "para que es esta pregunta". Unlike findFaq, this is grounded in the specific
 * pending question and recent turns, so it can explain *this* question even though no
 * FAQ entry covers it, instead of silently re-sending the same button prompt.
 */
export async function answerClarification(
  query: string,
  pendingQuestionText: string,
  history: RecentMessage[],
  opts?: { leadId?: string; correlationId?: string },
): Promise<string | null> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const historyText = history.length
      ? history.map((m) => `${m.direction === 'in' ? 'Usuario' : 'Bot'}: ${m.body}`).join('\n')
      : '(sin turnos previos)'

    const prompt = `Contexto sobre el bot y el flujo actual:
${BOT_CONTEXT}

La pregunta que el bot le acaba de hacer al usuario, y que sigue pendiente de respuesta, es:
"${pendingQuestionText}"

Últimos turnos de la conversación:
${historyText}

En vez de responder esa pregunta pendiente, el usuario escribió:
"${sanitized}"

Si esto es una duda genuina sobre la pregunta pendiente o el flujo (por ejemplo, para qué sirve, por qué se pregunta, qué pasa según la respuesta), respóndela de forma breve y concreta usando el contexto de arriba. Si no tienes información suficiente para responder con confianza, o el mensaje no es realmente una pregunta/duda, responde canAnswer: false.`

    const result = await generateObject({ model: chatModelPrecise(), schema: CLARIFY_SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'faq_clarify',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    if (!result.object.canAnswer || !result.object.answer) return null
    return result.object.answer
  } catch (err) {
    if (err instanceof InputRejectedError) return null
    await logCall({
      leadId: opts?.leadId,
      callType: 'faq_clarify',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return null
  }
}
