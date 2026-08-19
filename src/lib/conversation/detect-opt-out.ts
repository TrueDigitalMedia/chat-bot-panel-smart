import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  wantsToOptOut: z
    .boolean()
    .describe(
      'true solo si el mensaje pide explícitamente que dejen de contactarlo/escribirle — un opt-out real (ej. "dejen de escribirme", "no quiero más mensajes de esto", "me están acosando", "esto es spam", con o sin errores de tipeo). false para cualquier otra cosa, incluida una respuesta normal de la encuesta, una queja que no pide que paren de escribirle, o un mensaje que solo menciona una palabra relacionada (como su email o su forma de contacto preferida) sin pedir que dejen de contactarlo.',
    ),
})

/**
 * Confirms via AI whether a message that passed the cheap keyword pre-filter
 * (mightBeOptOutIntent, ./opt-out-heuristic) is a genuine request to stop being
 * contacted, as opposed to a coincidental keyword match (e.g. typing an email address
 * containing "contacto", or describing an unrelated problem). Only ever called from
 * flow-router.ts after that pre-filter passes and the fast regex (isOptOutRequest,
 * flow-router.ts) didn't already match, so cost stays bounded — dynamically imported
 * there for the same reason as detect-agent-handoff.ts (pulls in the DB client
 * transitively via logCall).
 */
export async function detectOptOutIntent(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<boolean> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un usuario está chateando con un bot de inscripción a un panel de encuestas. Escribió este mensaje:

"${sanitized}"

¿Este mensaje pide explícitamente que dejen de contactarlo/escribirle (un opt-out real)? Responde wantsToOptOut: false si es cualquier otra cosa, incluida una respuesta normal a una pregunta de la encuesta, una queja que no pide que paren de escribirle, o un mensaje que solo menciona de pasada una palabra relacionada (como su email) sin pedir que dejen de contactarlo.`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'opt_out_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return result.object.wantsToOptOut
  } catch (err) {
    if (err instanceof InputRejectedError) return false
    await logCall({
      leadId: opts?.leadId,
      callType: 'opt_out_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
