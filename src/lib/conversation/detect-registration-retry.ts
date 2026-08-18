import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  wantsToContinue: z
    .boolean()
    .describe(
      'true solo si el mensaje indica que el usuario en realidad sí se está registrando o quiere seguir intentándolo (ej. "me pide una contraseña", "me equivoqué de botón", "ya me registré", "cómo continúo").',
    ),
})

/**
 * Free text after "❌ No pude registrarme" can be a mistaken tap rather than a real
 * decline — the user may still be mid-registration and not realize the bot gave up on
 * them. Only ever called when the transition into code_delivered_not_registered was
 * caused by the user's own tap (statusReason === 'registration_user_decline'), never
 * for a real TDM webhook failure, where there's nothing to "regret".
 */
export async function detectRegistrationRetryIntent(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<boolean> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un usuario tocó el botón "❌ No pude registrarme" después de recibir un código de registro para una app, y el bot dio por terminado el proceso.

Después, el usuario escribió este mensaje:

"${sanitized}"

¿Este mensaje indica que en realidad sí se está registrando o quiere seguir intentándolo (por ejemplo dice que le pide una contraseña, pregunta cómo continuar, dice que se equivocó de botón, o dice que ya se registró)? Responde wantsToContinue: false si el mensaje es otra cosa (una pregunta general, un saludo, ruido, o simplemente no relacionado con retomar el registro).`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'registration_retry_intent',
      model: CHAT_MODEL_PRECISE_ID,
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
      callType: 'registration_retry_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
