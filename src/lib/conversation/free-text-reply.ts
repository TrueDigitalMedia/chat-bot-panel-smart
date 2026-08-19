import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { validateBotResponse } from '@/lib/ai/validate-output'
import { logCall } from '@/lib/db/call-log'
import { getRecentMessages } from '@/lib/db/conversation-messages'
import { supportRedirect } from './exit-messages'
import type { LeadStatus } from '@/types/lead'

const SCHEMA = z.object({
  intent: z
    .enum(['acknowledgment', 'needs_reply', 'registration_status_check'])
    .describe(
      '"acknowledgment": el usuario solo confirma/agradece/se despide (ok, vale, gracias, está bien, entiendo) y no hace falta responder. ' +
        '"registration_status_check": el usuario pregunta por el estado de su registro/inscripción (¿ya quedé registrado?, ¿ya se procesó?). ' +
        '"needs_reply": cualquier otra cosa que sí amerita una respuesta (pregunta, comentario, corrección).',
    ),
  reply: z
    .string()
    .max(400)
    .optional()
    .describe('Requerido si intent !== "acknowledgment". Respuesta breve (1-3 frases), en español, tono cercano.'),
})

export interface FreeTextReplyResult {
  intent: 'acknowledgment' | 'needs_reply' | 'registration_status_check'
  reply: string | null
}

/**
 * Decides how (or whether) to reply to free text that didn't match an expected button —
 * grounded in the full recent conversation (getRecentMessages), not a regex. Generalizes
 * the old decline-followup.ts (which only ran for declined/terminal leads) to every
 * free-text fallback path, and moves the "is this just a bare 'ok'?" call from a regex
 * (isClosingAcknowledgment) into the AI itself: seeing the actual last few turns lets it
 * recognize a closed-out exchange even when a single message's metadata flag can't be
 * trusted (e.g. a duplicate webhook delivery, a missed tag) — the cheap regex pre-filter
 * in flow-router.ts still short-circuits the obvious case before spending a call here.
 *
 * `context.isDeclined` adjusts the prompt: a declined/terminal lead must never be told
 * registration can restart (that's handled separately by
 * detectRegistrationRetryIntent/detectDeclineReversalIntent before this is ever reached).
 *
 * Falls back to { intent: 'needs_reply', reply: supportRedirect() } on any AI failure or
 * validateBotResponse rejection, so a broken AI call never leaves the lead without a reply.
 */
export async function generateFreeTextReply(
  leadId: string,
  query: string,
  correlationId: string,
  context: { leadStatus: LeadStatus; isDeclined: boolean },
): Promise<FreeTextReplyResult> {
  const start = Date.now()

  try {
    const sanitized = await sanitizeInput(query, { leadId, correlationId })
    const history = await getRecentMessages(leadId)
    const historyText = history.length
      ? history.map((m) => `${m.direction === 'in' ? 'Usuario' : 'Bot'}: ${m.body}`).join('\n')
      : '(sin turnos previos)'

    const situacion = context.isDeclined
      ? 'Su participación ya terminó (no calificó, declinó el registro, o pidió que no lo contacten más) y el bot ya se lo comunicó.'
      : 'Su registro sigue activo/en curso.'

    const prompt = `Un usuario chatea con un bot de inscripción a un panel de encuestas (PanelSmart). ${situacion}

Últimos turnos de la conversación:
${historyText}

El usuario acaba de escribir (texto libre que no calzó con ningún botón esperado):
"${sanitized}"

Decide la intención real usando el historial completo, no solo el mensaje suelto:
- Si es solo una confirmación/despedida sin nada nuevo que decir (ok, vale, gracias, está bien, entiendo, 👍) Y el bot ya le respondió algo parecido antes en esta conversación, marca "acknowledgment" y no generes "reply" — no hace falta cerrar la conversación otra vez.
- Si pregunta por el estado de su registro/inscripción (¿ya quedé registrado?, ¿ya se procesó mi inscripción?, ¿cuándo me confirman?), marca "registration_status_check" y en "reply" pon un mensaje breve de agradecimiento y cierre — no prometas nada, no invites a que responda de nuevo.
- Cualquier otra cosa (pregunta puntual, comentario, corrección), marca "needs_reply" y respóndela en "reply" de forma breve y coherente con lo que dijo.
${context.isDeclined ? 'No prometas que puede retomar el registro ni le des instrucciones para continuar.' : ''}
Si el "reply" es un cierre (acknowledgment tardío o registration_status_check), que no invite a más respuesta: sin preguntas, sin "igualmente".`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId,
      callType: 'free_text_reply',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    if (result.object.intent === 'acknowledgment') {
      return { intent: 'acknowledgment', reply: null }
    }
    const reply = result.object.reply
    if (reply && validateBotResponse(reply)) {
      return { intent: result.object.intent, reply }
    }
    return { intent: 'needs_reply', reply: supportRedirect() }
  } catch (err) {
    if (!(err instanceof InputRejectedError)) {
      await logCall({
        leadId,
        callType: 'free_text_reply',
        latencyMs: Date.now() - start,
        correlationId,
        error: String(err),
      }).catch(() => {})
    }
    return { intent: 'needs_reply', reply: supportRedirect() }
  }
}
