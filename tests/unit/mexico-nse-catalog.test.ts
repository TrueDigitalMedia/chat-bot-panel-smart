import { describe, it, expect } from 'vitest'
import { lookupMexicoNseRegion, lookupMexicoNseRegionEntry, MEXICO_REGIONS } from '@/lib/geo/mexico-nse-catalog'
import catalogJson from '../../data/geo/mexico-nse-regions.json'

// Vectors from specs/015-mexico-onboarding/contracts/mexico-geo-catalog.md — where the doc
// guessed a region ("e.g. Occidente", "null if absent"), the assertion uses the actual
// imported catalog value (the doc's own note: "region per catalog").

describe('lookupMexicoNseRegion — contract vectors', () => {
  it.each([
    ['Distrito Federal', 'Iztapalapa', 'AMCM'],
    ['México', 'Ecatepec de Morelos', 'AMCM'],
    ['Hidalgo', 'Tula de Allende', 'CENTRO'],
    ['Veracruz de Ignacio de la Llave', 'Las Choapas', 'CENTRO'],
    ['Yucatán', 'Mérida', 'MERIDA'],
    ['Jalisco', 'Guadalajara', 'GUADALAJARA'],
    ['Nuevo León', 'Monterrey', 'MONTERREY'],
  ] as const)('%s / %s -> %s', (estado, municipio, region) => {
    expect(lookupMexicoNseRegion(estado, municipio)).toBe(region)
  })

  it('accent/case-insensitive: "IZTAPALAPA" upper, "distrito federal" lower still resolves AMCM', () => {
    expect(lookupMexicoNseRegion('distrito federal', 'IZTAPALAPA')).toBe('AMCM')
  })

  it('a municipio name that exists in a different estado does not cross-match', () => {
    // Match is always on estado|municipio — an off-estado pairing returns null.
    expect(lookupMexicoNseRegion('Yucatán', 'Iztapalapa')).toBeNull()
  })

  it('an off-catalog estado/municipio -> null (out of geographic quota)', () => {
    expect(lookupMexicoNseRegion('Estado Inexistente', 'Municipio Inexistente')).toBeNull()
  })

  it('null estado or municipio -> null', () => {
    expect(lookupMexicoNseRegion(null, 'Iztapalapa')).toBeNull()
    expect(lookupMexicoNseRegion('Distrito Federal', null)).toBeNull()
  })
})

describe('lookupMexicoNseRegionEntry — metadata for logging/sync', () => {
  it('returns region + estrato + regionCode for a matched row', () => {
    const entry = lookupMexicoNseRegionEntry('Distrito Federal', 'Iztapalapa')
    expect(entry).toMatchObject({ region: 'AMCM', estrato: '1', regionCode: '5' })
  })

  it('every resolved region is one of MEXICO_REGIONS', () => {
    const region = lookupMexicoNseRegion('Jalisco', 'Guadalajara')
    expect(MEXICO_REGIONS).toContain(region)
  })
})

// >=30-address fixture toward SC-003 — a deterministic sample straight from the real
// catalog, asserting each resolves to its own recorded region.
describe('lookupMexicoNseRegion — >=30-address catalog sweep (SC-003)', () => {
  interface Row {
    region: string
    estado: string
    municipio: string
  }
  const regions = (catalogJson as { regions: Row[] }).regions

  function mulberry32(seed: number) {
    return () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const rand = mulberry32(20260905)
  const pool = [...regions]
  const sample: Row[] = []
  for (let i = 0; i < 36 && pool.length > 0; i++) {
    sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  }

  it('samples at least 30 addresses spanning multiple regions', () => {
    expect(sample.length).toBeGreaterThanOrEqual(30)
    expect(new Set(sample.map((r) => r.region)).size).toBeGreaterThan(2)
  })

  it.each(sample.map((row, i) => [i, row] as const))(
    'address #%d (%s / %s) resolves to its recorded region',
    (_i, row) => {
      expect(lookupMexicoNseRegion(row.estado, row.municipio)).toBe(row.region)
    },
  )
})
