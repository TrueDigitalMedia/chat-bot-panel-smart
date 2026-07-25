import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModel, CHAT_MODEL_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  wantsToContinue: z
    .boolean()
    .describe(
      'true solo si el mensaje expresa arrepentimiento por haber rechazado/dicho que no, y que en realidad quiere continuar la inscripción (ej. "me equivoqué", "sí quiero inscribirme", "perdón, sí quiero").',
    ),
})

/**
 * Free text after a decline (opt-in/D1/D2/D3 "No") can be a change of heart rather than
 * noise — phrasings vary too much ("Si perdon si quiero inscribirme", "Me equivoque al
 * responder") for a fixed regex list, so this asks an LLM to judge intent directly.
 * Only ever called from a terminal not_qualified/quota_exhausted state reached via a
 * decline, so the cost is negligible in practice.
 */
export async function detectDeclineReversalIntent(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<boolean> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un usuario había respondido "No" a una pregunta de inscripción de un bot (por ejemplo: rechazar términos y condiciones, decir que no quiere ganar premios, o decir que no es quien hace las compras del hogar), y el bot le dio por terminada la conversación.

Después, el usuario escribió este mensaje:

"${sanitized}"

¿Este mensaje indica que el usuario se arrepiente de haber dicho que no, y en realidad quiere continuar con la inscripción? Responde wantsToContinue: false si el mensaje es otra cosa (una pregunta, un saludo, ruido, o simplemente no relacionado con retomar la inscripción).`

    const result = await generateObject({ model: chatModel(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'decline_reversal_intent',
      model: CHAT_MODEL_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return result.object.wantsToContinue
  } catch (err) {
    if (err instanceof InputRejectedError) return false
    await logCall({
      leadId: opts?.leadId,
      callType: 'decline_reversal_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
