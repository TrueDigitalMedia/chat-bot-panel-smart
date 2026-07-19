import { generateObject } from 'ai'
import { z } from 'zod'
import { sanitizeInput, InputRejectedError } from './sanitize'
import { buildExtractionPrompt } from './prompt-builder'
import { chatModel, CHAT_MODEL_ID } from './models'
import { logCall } from '@/lib/db/call-log'
import { generateCorrelationId } from '@/lib/correlation'
import { env } from '@/lib/env'

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
  shoppingCategories: z.object({
    value: z
      .array(z.number().int().min(1).max(8))
      .max(8)
      .nullable(),
  }),
} as const

type FieldSchemaKey = keyof typeof FIELD_SCHEMAS

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
    const prompt = buildExtractionPrompt(fieldName, sanitized)
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
