import { describe, it, expect } from 'vitest'
import { buildResponseItem, codigoPreguntaForField, formatRespuesta, preguntaForField } from './question-map'

describe('question-map', () => {
  it('uses the internal field name as codigo_pregunta (placeholder pending Kantar codes)', () => {
    expect(codigoPreguntaForField('cars')).toBe('cars')
    expect(codigoPreguntaForField('shoppingFrequency')).toBe('shoppingFrequency')
  })

  it('looks up pregunta text from the survey/ficha-hogar question definitions', () => {
    expect(preguntaForField('cars')).toBe('¿De cuántos autos dispone regularmente este hogar?')
    expect(preguntaForField('hasInternet')).toBe('¿Tienen acceso a internet en tu hogar?')
  })

  it('formats booleans as Sí/No', () => {
    expect(formatRespuesta(true)).toBe('Sí')
    expect(formatRespuesta(false)).toBe('No')
  })

  it('formats shopping-category id arrays as comma-joined labels', () => {
    expect(formatRespuesta([1, 2])).toBe('Canasta básica, Lácteos')
  })

  it('falls back to joining unrecognized array values as-is', () => {
    expect(formatRespuesta(['a', 'b'])).toBe('a, b')
  })

  it('stringifies plain values', () => {
    expect(formatRespuesta('Q8,000')).toBe('Q8,000')
    expect(formatRespuesta(3)).toBe('3')
  })

  it('builds a full response item from a field name + value', () => {
    expect(buildResponseItem('cars', '2 o más')).toEqual({
      codigo_pregunta: 'cars',
      pregunta: '¿De cuántos autos dispone regularmente este hogar?',
      respuesta: '2 o más',
    })
  })
})
