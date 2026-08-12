import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  wantsAgent: z
    .boolean()
    .describe(
      'true solo si el mensaje es (o intenta ser, con errores de tipeo) la palabra "agente", pedida para que un humano lo atienda — ej. "agende", "ajente", "agenta", "agent", "un agente porfa". false para cualquier otra cosa, incluida una respuesta normal de la encuesta que casualmente se parezca.',
    ),
})

/**
 * Confirms via AI whether a short, typo-like message was actually an attempt to type
 * "agente" (asking for a human handoff), as opposed to a coincidentally similar word.
 * Only ever called from flow-router.ts after mightBeAgenteTypo() (./agent-typo) passes,
 * so cost stays negligible — this file is dynamically imported there for that reason,
 * since it pulls in the DB client transitively via logCall.
 */
export async function detectAgentHandoffIntent(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<boolean> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un usuario está chateando con un bot de inscripción a un panel de encuestas. Escribió este mensaje:

"${sanitized}"

¿Este mensaje es la palabra "agente" (posiblemente con errores de tipeo), pedida porque quiere que un humano lo atienda? Responde wantsAgent: false si es cualquier otra cosa, incluida una respuesta normal a una pregunta de la encuesta.`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'agent_handoff_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return result.object.wantsAgent
  } catch (err) {
    if (err instanceof InputRejectedError) return false
    await logCall({
      leadId: opts?.leadId,
      callType: 'agent_handoff_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
