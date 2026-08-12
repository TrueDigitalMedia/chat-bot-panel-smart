import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

export type CorrectionIntentAI =
  | { kind: 'none' }
  | { kind: 'open_menu' }
  | { kind: 'correct_field'; field: string; value: string | null }
  | { kind: 'unsupported_field'; label: string }

/**
 * AI fallback for correction requests detectCorrectionIntent's regex can't parse — loose
 * phrasing ("seleccione mal el pais, puedo corregirlo"), or a field name the regex
 * resolved but couldn't match to a known alias ("corregir mi telefono"). Only worth
 * calling once the regex already returned 'none' and the message failed to resolve as a
 * normal answer to the pending question — the caller (tryHandleCorrectionRequest in
 * correction.ts, or its Ficha Hogar equivalent) is responsible for that gating, this
 * function just classifies. `field` is a plain string, not SurveyFieldName — reused for
 * both Phase 1's survey fields and Ficha Hogar's, each caller validates the returned
 * field against its own set.
 *
 * Split into its own file (dynamically imported by callers) so its DB/AI imports don't
 * pull database client code into the static import graph of files that only need the
 * pure regex detector in ./detect-correction-intent.ts.
 */
export async function detectCorrectionIntentAI(
  messageText: string,
  filledFields: { field: string; label: string; value: string }[],
  pendingQuestionText: string,
  opts: { leadId: string; correlationId: string },
): Promise<CorrectionIntentAI> {
  if (!messageText.trim()) return { kind: 'none' }

  const fieldNames = filledFields.map((f) => f.field)
  const schema = z.object({
    kind: z.enum(['open_menu', 'correct_field', 'unsupported_field', 'none']).describe(
      '"open_menu" si pide corregir algo sin decir qué. "correct_field" si nombra uno de los campos ya contestados (de la lista dada). "unsupported_field" si quiere corregir algo que NO está en esa lista (ej. su número de teléfono). "none" si no es un pedido de corrección.',
    ),
    field:
      fieldNames.length > 0
        ? z.enum([fieldNames[0]!, ...fieldNames.slice(1)]).nullable()
        : z.null(),
    value: z.string().nullable().describe('El nuevo valor, solo si el usuario ya lo dio explícitamente en el mismo mensaje. Null si solo pidió corregir sin dar el valor nuevo.'),
    unsupportedLabel: z.string().nullable().describe('Si kind es "unsupported_field", una descripción corta en español de qué quiere corregir (ej. "número de teléfono"). Null en otro caso.'),
  })

  const start = Date.now()
  try {
    const sanitized = await sanitizeInput(messageText, { leadId: opts.leadId, correlationId: opts.correlationId })

    const fieldsList =
      filledFields.length > 0
        ? filledFields.map((f) => `- ${f.field}: "${f.label}" (valor actual: ${f.value})`).join('\n')
        : '(ninguno todavía)'

    const prompt = `Un bot de inscripción le hizo esta pregunta a un usuario, que no la respondió:
"${pendingQuestionText}"

Campos que el usuario ya contestó antes en esta conversación:
${fieldsList}

El usuario escribió esto en su lugar:
"${sanitized}"

¿Está pidiendo corregir una respuesta anterior? Si nombra un campo, debe ser exactamente uno de los de la lista de arriba (usa su nombre técnico, ej. "country", "stateProvince"). Si pide corregir algo que no está en esa lista (como su número de teléfono, que no se pregunta ahí), responde "unsupported_field". Si no es un pedido de corrección de ningún tipo, responde "none".`

    const result = await generateObject({ model: chatModelPrecise(), schema, prompt })

    await logCall({
      leadId: opts.leadId,
      callType: 'correction_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId: opts.correlationId,
    }).catch(() => {})

    const { kind, field, value, unsupportedLabel } = result.object
    if (kind === 'open_menu') return { kind: 'open_menu' }
    if (kind === 'correct_field' && field && fieldNames.includes(field)) {
      return { kind: 'correct_field', field, value: value ?? null }
    }
    if (kind === 'unsupported_field') {
      return { kind: 'unsupported_field', label: unsupportedLabel ?? 'ese dato' }
    }
    return { kind: 'none' }
  } catch (err) {
    if (err instanceof InputRejectedError) return { kind: 'none' }
    await logCall({
      leadId: opts.leadId,
      callType: 'correction_intent',
      latencyMs: Date.now() - start,
      correlationId: opts.correlationId,
      error: String(err),
    }).catch(() => {})
    return { kind: 'none' }
  }
}
