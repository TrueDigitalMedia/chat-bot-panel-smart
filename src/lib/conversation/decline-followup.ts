import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { validateBotResponse } from '@/lib/ai/validate-output'
import { logCall } from '@/lib/db/call-log'
import { getRecentMessages } from '@/lib/db/conversation-messages'
import { supportRedirect } from './exit-messages'

const SCHEMA = z.object({
  reply: z
    .string()
    .max(400)
    .describe('Respuesta breve (1-3 frases), en español, tono cercano y empático.'),
})

/**
 * Generates a context-aware reply for a lead whose registration already ended
 * (declined, or a terminal status reached via an opt-in/D1/D2/D3 decline) and who
 * keeps writing anyway. Without this, every further message got the exact same static
 * supportRedirect() text regardless of what the user actually said — the
 * byte-identical-repeat dedupe (messaging/send.ts) only rotates a trailing nudge on top
 * of it, it doesn't make the reply itself coherent with the conversation (see the
 * 8d6d9907 case: 8 near-identical replies to a user's short "Ok"/"Sk" messages). Grounds
 * the reply in recent turns so it can acknowledge what was actually said, while staying
 * firm the process ended — never implies registration can restart (that's already
 * handled separately by detectRegistrationRetryIntent/detectDeclineReversalIntent
 * before flow-router.ts ever reaches this fallback). Falls back to the static
 * supportRedirect() on any AI failure or a validateBotResponse rejection, so a broken
 * AI call never leaves the lead without a reply.
 */
export async function generateDeclineFollowupReply(
  leadId: string,
  query: string,
  correlationId: string,
): Promise<string> {
  const start = Date.now()

  try {
    const sanitized = await sanitizeInput(query, { leadId, correlationId })
    const history = await getRecentMessages(leadId)
    const historyText = history.length
      ? history.map((m) => `${m.direction === 'in' ? 'Usuario' : 'Bot'}: ${m.body}`).join('\n')
      : '(sin turnos previos)'

    const prompt = `Un usuario chateaba con un bot de inscripción a un panel de encuestas (PanelSmart). Su participación ya terminó (no calificó, declinó el registro, o pidió que no lo contacten más) y el bot ya se lo comunicó.

Últimos turnos de la conversación:
${historyText}

A pesar de eso, el usuario volvió a escribir:
"${sanitized}"

Responde de forma breve, cálida y coherente con lo que el usuario acaba de decir — no repitas el mismo mensaje genérico de siempre. No prometas que puede retomar el registro ni le des instrucciones para continuar. Si pregunta algo puntual (por qué, cómo, qué pasa con sus datos), respóndelo brevemente. Si solo confirma o se despide (ej. "ok", "gracias"), responde con algo corto y cordial que cierre la conversación.`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId,
      callType: 'decline_followup_reply',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    const reply = result.object.reply
    return validateBotResponse(reply) ? reply : supportRedirect()
  } catch (err) {
    if (!(err instanceof InputRejectedError)) {
      await logCall({
        leadId,
        callType: 'decline_followup_reply',
        latencyMs: Date.now() - start,
        correlationId,
        error: String(err),
      }).catch(() => {})
    }
    return supportRedirect()
  }
}
