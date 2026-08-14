import { describe, expect, it } from 'vitest'
import { formatGpsConfirmText } from '@/lib/geo/gps-confirm-format'

describe('gps-confirm-format', () => {
  it('never shows barrio/neighborhood, even when the proposal has one', () => {
    const text = formatGpsConfirmText({
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Mixco',
      neighborhood: 'Zona 1',
    })
    expect(text).toContain('País: Guatemala')
    expect(text).toContain('Municipio/Cantón: Mixco')
    expect(text).not.toContain('Barrio')
    expect(text).not.toContain('Zona 1')
  })
})
