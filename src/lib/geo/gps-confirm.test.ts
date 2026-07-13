import { describe, expect, it } from 'vitest'
import { formatGpsConfirmText } from '@/lib/geo/gps-confirm-format'

describe('gps-confirm-format', () => {
  it('shows No identificado when barrio missing', () => {
    const text = formatGpsConfirmText({
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Mixco',
      neighborhood: null,
    })
    expect(text).toContain('País: Guatemala')
    expect(text).toContain('Municipio/Cantón: Mixco')
    expect(text).toContain('Barrio: No identificado')
  })
})
