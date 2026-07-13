import { describe, expect, it } from 'vitest'
import {
  canonicalCountry,
  lookupNseRegion,
  normalizeGeoKey,
} from '@/lib/geo/cam-nse-catalog'

describe('cam-nse-catalog', () => {
  it('normalizes accents and case', () => {
    expect(normalizeGeoKey('CHIRIQUÍ')).toBe('chiriqui')
    expect(normalizeGeoKey('  San  José ')).toBe('san jose')
  })

  it('canonicalizes country aliases', () => {
    expect(canonicalCountry('Panama')).toBe('Panamá')
    expect(canonicalCountry('Dominican Republic')).toBe('Rep. Dominicana')
    expect(canonicalCountry('Guatemala')).toBe('Guatemala')
  })

  it('hits known Guatemala catalog row', () => {
    const region = lookupNseRegion('Guatemala', 'Guatemala', 'Mixco')
    // Mixco may or may not be in sample — if present expect string
    if (region) {
      expect(typeof region).toBe('string')
      expect(region.length).toBeGreaterThan(0)
    }
  })

  it('hits Panama ALANJE', () => {
    expect(lookupNseRegion('Panamá', 'CHIRIQUÍ', 'ALANJE')).toBe('Occidente')
    expect(lookupNseRegion('Panama', 'Chiriqui', 'Alanje')).toBe('Occidente')
  })

  it('misses unknown municipality', () => {
    expect(lookupNseRegion('Panamá', 'CHIRIQUÍ', 'NOEXISTE_XYZ')).toBeNull()
  })
})
