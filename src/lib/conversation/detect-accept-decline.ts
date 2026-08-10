import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  intent: z
    .enum(['accept', 'decline', 'unclear'])
    .describe(
      '"accept" si el mensaje acepta/afirma la pregunta (ej. "sí", "acepto", "dale", "claro que sí"). "decline" si la rechaza (ej. "no", "no gracias", "no quiero"). "unclear" si es una pregunta, saludo, ruido, o cualquier otra cosa que no sea claramente una aceptación o un rechazo de esa pregunta específica.',
    ),
})

/**
 * Free text typed instead of tapping a decision-gate button ("acepto" instead of
 * tapping "Confirmo y acepto") doesn't reliably match matchButtonChoice — its
 * core-word check requires the *entire* multi-word label to appear in the typed text,
 * which "acepto" alone never satisfies against a label like "Confirmo y acepto".
 * Phrasing varies too much for a fixed regex list, so this asks an LLM to judge
 * accept/decline intent directly — same approach detectDeclineReversalIntent uses for
 * the narrower "user changed their mind after declining" case.
 */
export async function detectAcceptDeclineIntent(
  query: string,
  pendingQuestionText: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<'accept' | 'decline' | null> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un bot de inscripción le hizo esta pregunta a un usuario (con botones "Sí"/"No" o equivalentes, que el usuario no tocó):

"${pendingQuestionText}"

El usuario respondió con este texto libre en su lugar:

"${sanitized}"

¿Esta respuesta acepta o rechaza esa pregunta?`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'accept_decline_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return result.object.intent === 'unclear' ? null : result.object.intent
  } catch (err) {
    if (err instanceof InputRejectedError) return null
    await logCall({
      leadId: opts?.leadId,
      callType: 'accept_decline_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return null
  }
}
