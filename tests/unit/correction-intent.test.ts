import { describe, expect, it } from 'vitest'
import { detectCorrectionIntent } from '@/lib/conversation/detect-correction-intent'

describe('detectCorrectionIntent', () => {
  it('detects open menu', () => {
    expect(detectCorrectionIntent('quiero corregir').kind).toBe('open_menu')
    expect(detectCorrectionIntent('corregir una respuesta').kind).toBe('open_menu')
  })

  it('detects correct field without value', () => {
    const r = detectCorrectionIntent('quiero corregir email')
    expect(r).toEqual({ kind: 'correct_field', field: 'email', value: null })
  })

  it('detects correct field with value', () => {
    const r = detectCorrectionIntent('actualiza el email a ana@mail.com')
    expect(r).toEqual({
      kind: 'correct_field',
      field: 'email',
      value: 'ana@mail.com',
    })
  })

  it('detects nombre alias', () => {
    const r = detectCorrectionIntent('cambiar nombre')
    expect(r).toEqual({ kind: 'correct_field', field: 'fullName', value: null })
  })

  it('ignores normal answers', () => {
    expect(detectCorrectionIntent('Sacatepéquez').kind).toBe('none')
    expect(detectCorrectionIntent('ana@mail.com').kind).toBe('none')
  })
})
