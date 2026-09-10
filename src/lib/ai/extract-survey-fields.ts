import { generateObject } from 'ai'
import { z } from 'zod'
import { sanitizeInput, InputRejectedError } from './sanitize'
import { buildExtractionPrompt } from './prompt-builder'
import { chatModel, CHAT_MODEL_ID } from './models'
import { logCall } from '@/lib/db/call-log'
import { generateCorrelationId } from '@/lib/correlation'
import { env } from '@/lib/env'
import { SHOPPING_CATEGORIES } from '@/lib/conversation/survey-questions'
import { resolveEmail } from '@/lib/conversation/email-answer'

interface ExtractionResult<T> {
  ok: boolean
  value?: T
  correlationId: string
}

const FIELD_SCHEMAS = {
  fullName: z.object({ value: z.string().min(1).max(200).nullable() }),
  stateProvince: z.object({ value: z.string().min(1).max(100).nullable() }),
  municipality: z.object({ value: z.string().min(1).max(100).nullable() }),
  neighborhood: z.object({ value: z.string().min(1).max(100).nullable() }),
  email: z.object({ value: z.string().email().max(200).nullable() }),
  householdSize: z.object({ value: z.number().int().positive().max(30).nullable() }),
  bedrooms: z.object({ value: z.number().int().min(0).max(20).nullable() }),
  age: z.object({ value: z.number().int().min(13).max(100).nullable() }),
  // México Código Postal — 5 digits (spec 015).
  codigoPostal: z.object({ value: z.string().regex(/^\d{5}$/).nullable() }),
  dateOfBirth: z.object({ value: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/).nullable() }),
  petCount: z.object({ value: z.number().int().min(0).max(50).nullable() }),
  shoppingCategories: z.object({
    value: z
      .array(z.number().int().min(1).max(8))
      .max(8)
      .nullable(),
  }),
} as const

type FieldSchemaKey = keyof typeof FIELD_SCHEMAS

const SHOPPING_CATEGORIES_HINT_LIST = SHOPPING_CATEGORIES.map((c) => `${c.id}=${c.label}`).join(', ')

// Extra formatting guidance for fields where the field name alone isn't enough
// for the model to reliably produce a value matching the Zod schema (e.g. a
// specific date format, or — for shoppingCategories — the numbered category list
// the user was shown in the question text but the extraction prompt never sees).
export const FIELD_HINTS: Partial<Record<FieldSchemaKey, string>> = {
  dateOfBirth:
    'Formato esperado: DD/MM/AAAA (día/mes/año, con ceros a la izquierda). Convierte cualquier fecha mencionada en el mensaje a ese formato exacto.',
  shoppingCategories: `Esta pregunta le mostró al usuario una lista numerada de categorías y le pidió indicar todas las que apliquen, usando los números directamente: ${SHOPPING_CATEGORIES_HINT_LIST}. El usuario puede responder con números sueltos o separados por comas/espacios ("1", "1,3,8", "1 y 3"), con los nombres de las categorías, o combinando ambos — en cualquier caso, mapea cada mención al id numérico correspondiente de esa lista y devuelve el arreglo de esos ids, sin duplicados, en cualquier orden. Si el usuario indica explícitamente que no compra ninguna de estas categorías (por ejemplo "ninguna" o "no compro nada"), devuelve un arreglo vacío []. Devuelve null únicamente si el mensaje no tiene relación alguna con esta pregunta.`,
  householdSize:
    'Si el usuario escribe el número en palabras (p. ej. "siete", "ocho", "diez"), conviértelo a su forma numérica.',
  bedrooms:
    'Si el usuario escribe el número en palabras (p. ej. "siete", "ocho", "diez"), conviértelo a su forma numérica.',
  codigoPostal:
    'Un código postal mexicano de exactamente 5 dígitos. Extrae solo los 5 dígitos (p. ej. "mi CP es 06700" → "06700", "03810." → "03810"). Devuelve null si el mensaje no contiene un número de 5 dígitos.',
}

/**
 * A value we can extract without the model when the answer has an unambiguous shape —
 * a fast path that skips the model call, and with it the `AI_NoObjectGeneratedError`
 * (an empty / rate-limited API reply, not a model mistake) that kept hitting
 * `email` extraction. Returns `undefined` when there is no confident deterministic
 * value.
 *
 * `email` is fully deterministic (see `resolveEmail`): a clean address anywhere in the
 * text, or a near-miss repair (dictated "arroba"/"punto", spaces, provider typos,
 * missing TLD). The validation is `z.string().email()` — byte-for-byte the check the
 * model schema used — so the model never needs to see this field; `extractField`
 * returns `ok: false` on a miss and the caller re-asks.
 */
function deterministicValue(fieldName: FieldSchemaKey, text: string): string | undefined {
  if (fieldName === 'email') return resolveEmail(text) ?? undefined
  return undefined
}

export async function extractField(
  fieldName: FieldSchemaKey,
  userText: string,
  opts?: { leadId?: string },
): Promise<ExtractionResult<unknown>> {
  const correlationId = generateCorrelationId()

  // Test override for error simulation
  if (env.FORCE_EXTRACTION_ERROR === fieldName) {
    return { ok: false, correlationId }
  }

  let sanitized: string
  try {
    sanitized = await sanitizeInput(userText, { leadId: opts?.leadId, correlationId })
  } catch (err) {
    if (err instanceof InputRejectedError) {
      return { ok: false, correlationId }
    }
    throw err
  }

  const model = CHAT_MODEL_ID
  const start = Date.now()

  // Fast path: skip the model entirely when the answer is deterministically parseable
  // (see deterministicValue). Removes the model call — and its ~16% empty-response
  // failure rate — from the hot path for the fields it covers.
  const shortCircuit = deterministicValue(fieldName, sanitized)
  if (shortCircuit !== undefined) {
    console.info('[extractField] resolved deterministically', {
      correlationId,
      leadId: opts?.leadId,
      fieldName,
    })
    await logCall({
      leadId: opts?.leadId,
      callType: 'field_extraction',
      model: 'deterministic',
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})
    return { ok: true, value: shortCircuit, correlationId }
  }

  // `email` is deterministic-only — never fall through to the model. `resolveEmail`
  // above already ran every repair we have; if it still didn't produce a valid
  // address the answer genuinely isn't one (e.g. "no me acuerdo", a phone number),
  // so return a miss and let the caller re-ask. This is what removes
  // AI_NoObjectGeneratedError from the email path for good.
  if (fieldName === 'email') {
    console.warn('[extractField] email not resolvable — re-ask', {
      correlationId,
      leadId: opts?.leadId,
      textPreview: sanitized.slice(0, 120),
    })
    await logCall({
      leadId: opts?.leadId,
      callType: 'field_extraction',
      model: 'deterministic',
      latencyMs: Date.now() - start,
      correlationId,
      error: 'email_unresolved',
    }).catch(() => {})
    return { ok: false, correlationId }
  }

  try {
    const prompt = buildExtractionPrompt(fieldName, sanitized, FIELD_HINTS[fieldName])
    const schema = FIELD_SCHEMAS[fieldName]

    // "the model did not return a response" is an empty/rate-limited API reply, not a
    // model mistake — it jumped from ~1% to ~16% of calls when traffic scaled ~10x in
    // 2026-09, and it fails fast (~800ms). Retry a couple of times with backoff.
    const RETRYABLE = /did not return a response|rate.?limit|overloaded|ECONNRESET|fetch failed/i
    let result: Awaited<ReturnType<typeof generateObject<typeof schema>>>
    for (let attempt = 0; ; attempt++) {
      try {
        result = await generateObject({ model: chatModel(), schema, prompt })
        break
      } catch (err) {
        if (attempt >= 2 || !RETRYABLE.test(String(err))) throw err
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }

    const latencyMs = Date.now() - start
    await logCall({
      leadId: opts?.leadId,
      callType: 'field_extraction',
      model,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs,
      correlationId,
    }).catch(() => {})

    const value = result.object.value
    if (value === null) return { ok: false, correlationId }

    return { ok: true, value, correlationId }
  } catch (err) {
    const latencyMs = Date.now() - start
    console.error('[extractField] failed', {
      fieldName,
      correlationId,
      leadId: opts?.leadId,
      textPreview: sanitized.slice(0, 120),
      error: String(err),
    })
    await logCall({
      leadId: opts?.leadId,
      callType: 'field_extraction',
      model,
      latencyMs,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return { ok: false, correlationId }
  }
}
