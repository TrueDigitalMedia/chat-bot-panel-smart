import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }))

vi.mock('ai', () => ({ generateObject }))
vi.mock('@/lib/env', () => ({ env: { FORCE_EXTRACTION_ERROR: undefined } }))
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/db/call-log', () => ({ logCall: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./sanitize', () => ({
  sanitizeInput: vi.fn(async (t: string) => t),
  InputRejectedError: class InputRejectedError extends Error {},
}))
vi.mock('./models', () => ({ CHAT_MODEL_ID: 'test-model', chatModel: () => 'model' }))

import { extractField } from './extract-survey-fields'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('extractField — email', () => {
  it('resolves a well-formed address deterministically, without calling the model', async () => {
    const res = await extractField('email', 'juan.perez@gmail.com')

    expect(res).toMatchObject({ ok: true, value: 'juan.perez@gmail.com' })
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('extracts a clean address from inside a sentence — model never runs even if it would fail', async () => {
    generateObject.mockRejectedValue(new Error('AI_NoObjectGeneratedError: the model did not return a response'))

    const res = await extractField('email', 'mi correo: ana@empresa.com.mx gracias')

    expect(res).toMatchObject({ ok: true, value: 'ana@empresa.com.mx' })
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('does not accept a malformed address on the fast path — defers to the model', async () => {
    generateObject.mockResolvedValue({ object: { value: 'juan@gmail.com' }, usage: {} })

    const res = await extractField('email', 'juan arroba gmail punto com')

    expect(generateObject).toHaveBeenCalled()
    expect(res).toMatchObject({ ok: true, value: 'juan@gmail.com' })
  })

  it('consults the model when the text has no parseable address, and gives up if it fails', async () => {
    generateObject.mockRejectedValue(new Error('AI_NoObjectGeneratedError: the model did not return a response'))

    const res = await extractField('email', 'no me acuerdo ahorita')

    expect(generateObject).toHaveBeenCalled()
    expect(res.ok).toBe(false)
  })
})

describe('extractField — non-deterministic fields still use the model', () => {
  it('calls the model for fullName and returns its object value', async () => {
    generateObject.mockResolvedValue({ object: { value: 'María López' }, usage: {} })

    const res = await extractField('fullName', 'me llamo maria lopez')

    expect(generateObject).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ ok: true, value: 'María López' })
  })

  it('retries a retryable model failure before succeeding', async () => {
    generateObject
      .mockRejectedValueOnce(new Error('the model did not return a response'))
      .mockResolvedValueOnce({ object: { value: 7 }, usage: {} })

    const res = await extractField('householdSize', 'somos siete')

    expect(generateObject).toHaveBeenCalledTimes(2)
    expect(res).toMatchObject({ ok: true, value: 7 })
  })
})
