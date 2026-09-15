import { describe, it, expect } from 'vitest'
import { buildResponseItem } from '@/lib/panel-smart/question-map'
import { NON_COLUMN_SCORING_FIELDS } from '@/types/lead'

describe('panel-smart question-map: non-column NSE scoring fields', () => {
  it('gives every Ecuador/México non-column scoring field a real (non-fallback) label', () => {
    for (const field of NON_COLUMN_SCORING_FIELDS) {
      const item = buildResponseItem(field, 'some answer')
      expect(item.codigo_pregunta).toBe(field)
      expect(item.pregunta).not.toBe(field)
      expect(item.pregunta.length).toBeGreaterThan(0)
      expect(item.respuesta).toBe('some answer')
    }
  })

  it('formats a boolean-shaped scoring answer the same way as any other synced field', () => {
    const item = buildResponseItem('internetAccess', 'Internet Hogar contratado (cable)')
    expect(item).toEqual({
      codigo_pregunta: 'internetAccess',
      pregunta: 'Acceso a Internet',
      respuesta: 'Internet Hogar contratado (cable)',
    })
  })
})
