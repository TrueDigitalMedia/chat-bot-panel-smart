import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'
import type { InlineKeyboardButton } from '@/types/telegram'

/**
 * AI fallback for free text that didn't match matchButtonChoice's string heuristics —
 * e.g. "acepto" for a T&C gate whose buttons say "Confirmo y acepto", or "como 3 o 4
 * carros" for a cars question. Builds the schema dynamically from the current
 * question's own button callback_data values (+ 'unclear'), so it's the one AI
 * interpretation path reused across binary gates and multi-option survey/Ficha Hogar
 * questions alike, instead of a bespoke classifier per question.
 */
export async function interpretButtonAnswer(
  buttons: InlineKeyboardButton[][],
  messageText: string,
  pendingQuestionText: string,
  opts: { leadId: string; correlationId: string },
): Promise<string | null> {
  const options = buttons.flat()
  if (options.length < 2 || !messageText.trim()) return null

  const values = options.map((b) => b.callback_data)
  const schema = z.object({
    choice: z.enum([values[0], ...values.slice(1), 'unclear']).describe(
      'La opción que el usuario quiso elegir, identificada por su callback_data exacto. "unclear" si el mensaje no es una respuesta clara a ninguna opción (p. ej. es una pregunta, un saludo, o ruido).',
    ),
  })

  const optionsList = options.map((b) => `- "${b.text}" (callback_data: "${b.callback_data}")`).join('\n')
  const start = Date.now()

  try {
    const sanitized = await sanitizeInput(messageText, { leadId: opts.leadId, correlationId: opts.correlationId })

    const prompt = `Un bot de inscripción le hizo esta pregunta a un usuario, con botones que no tocó:
"${pendingQuestionText}"

Opciones disponibles:
${optionsList}

El usuario respondió con este texto libre en su lugar:
"${sanitized}"

¿Cuál opción quiso elegir? Si no es una elección clara entre esas opciones, responde "unclear".`

    const result = await generateObject({ model: chatModelPrecise(), schema, prompt })

    await logCall({
      leadId: opts.leadId,
      callType: 'button_answer_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId: opts.correlationId,
    }).catch(() => {})

    return result.object.choice === 'unclear' ? null : result.object.choice
  } catch (err) {
    if (err instanceof InputRejectedError) return null
    await logCall({
      leadId: opts.leadId,
      callType: 'button_answer_intent',
      latencyMs: Date.now() - start,
      correlationId: opts.correlationId,
      error: String(err),
    }).catch(() => {})
    return null
  }
}
