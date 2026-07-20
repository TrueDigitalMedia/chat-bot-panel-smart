import { generateObject } from 'ai'
import { z } from 'zod'
import { sanitizeInput, InputRejectedError } from './sanitize'
import { buildExtractionPrompt } from './prompt-builder'
import { chatModel, CHAT_MODEL_ID } from './models'
import { logCall } from '@/lib/db/call-log'
import { generateCorrelationId } from '@/lib/correlation'
import { env } from '@/lib/env'
import { SHOPPING_CATEGORIES } from '@/lib/conversation/survey-questions'

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
  try {
    const prompt = buildExtractionPrompt(fieldName, sanitized, FIELD_HINTS[fieldName])
    const schema = FIELD_SCHEMAS[fieldName]

    const result = await generateObject({
      model: chatModel(),
      schema,
      prompt,
    })

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
    console.error('[extractField] failed', { fieldName, error: String(err) })
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
