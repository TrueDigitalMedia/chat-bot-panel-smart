import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  wantsToReturn: z
    .boolean()
    .describe(
      'true solo si el mensaje pide explícitamente reactivar el proceso / volver a participar tras haber pedido antes que no lo contactaran (ej. "cambié de opinión, quiero volver", "sí quiero participar", "reactívenme", "retomar"). false para una queja, una pregunta suelta, un saludo, o un mensaje que solo menciona de pasada una palabra relacionada sin pedir volver.',
    ),
})

/**
 * Confirms via AI whether a message from a lead who ALREADY opted out
 * (statusReason in OPT_OUT_STATUS_REASONS) is an explicit request to reactivate the
 * process. Only ever called from flow-router.ts after a cheap keyword pre-filter, so
 * cost stays bounded — dynamically imported there for the same reason as
 * detect-opt-out.ts (pulls in the DB client transitively via logCall). Fallback is
 * `false`: an ambiguous message must leave the lead opted out.
 */
export async function detectOptOutReversalIntent(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<boolean> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un usuario ya había pedido que dejaran de contactarlo por su inscripción a un panel de encuestas (PanelSmart), y el bot confirmó que no lo contactaría más. Ahora escribió este mensaje:

"${sanitized}"

¿Este mensaje pide explícitamente reactivar el proceso o volver a participar (cambió de opinión)? Responde wantsToReturn: false si es cualquier otra cosa — una queja, una pregunta general, un saludo, ruido, o un mensaje que solo menciona de pasada una palabra relacionada sin pedir volver.`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'opt_out_reversal_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return result.object.wantsToReturn
  } catch (err) {
    if (err instanceof InputRejectedError) return false
    await logCall({
      leadId: opts?.leadId,
      callType: 'opt_out_reversal_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
