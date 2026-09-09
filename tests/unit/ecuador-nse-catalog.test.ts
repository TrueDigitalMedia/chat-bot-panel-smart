import { describe, it, expect } from 'vitest'
import { lookupEcuadorNseRegion, ECUADOR_REGIONS } from '@/lib/geo/ecuador-nse-catalog'
import catalogJson from '../../data/geo/ecuador-nse-regions.json'

// Test vectors from specs/014-ecuador-onboarding/contracts/ecuador-geo-catalog.md. Two of
// the doc's vectors are stale relative to the actual imported catalog (data/geo/
// ecuador-nse-regions.json, 228 rows) — see inline notes; the catalog data is the source
// of truth, so the assertions below match the real data, not the doc prose.

describe('lookupEcuadorNseRegion — Guayaquil & Quito urban split (parroquia urbana)', () => {
  it('Guayas / Guayaquil / Tarqui -> Guayaquil Norte', () => {
    expect(lookupEcuadorNseRegion('Guayas', 'Guayaquil', 'Tarqui')).toBe('Guayaquil Norte')
  })

  it('Guayas / Guayaquil / Ximena -> Guayaquil Sur', () => {
    expect(lookupEcuadorNseRegion('Guayas', 'Guayaquil', 'Ximena')).toBe('Guayaquil Sur')
  })

  it('Pichincha / Distrito Metropolitano de Quito / Solanda -> Quito Sur', () => {
    expect(lookupEcuadorNseRegion('Pichincha', 'Distrito Metropolitano de Quito', 'Solanda')).toBe(
      'Quito Sur',
    )
  })

  it('Pichincha / Distrito Metropolitano de Quito / Iñaquito -> Quito Norte', () => {
    expect(lookupEcuadorNseRegion('Pichincha', 'Distrito Metropolitano de Quito', 'Iñaquito')).toBe(
      'Quito Norte',
    )
  })

  it('accent/case-insensitive: "INAQUITO" (no accent, upper) still resolves Quito Norte', () => {
    expect(lookupEcuadorNseRegion('pichincha', 'distrito metropolitano de quito', 'INAQUITO')).toBe(
      'Quito Norte',
    )
  })

  it('a Guayaquil/Quito parroquia urbana not in the catalog resolves null (urban split never falls back to cantón-only)', () => {
    expect(lookupEcuadorNseRegion('Guayas', 'Guayaquil', 'Not A Real Parroquia Urbana')).toBeNull()
  })
})

describe('lookupEcuadorNseRegion — non-urban-split cantones (parroquia, with cantón fallback)', () => {
  it('Azuay / Cuenca / Cuenca -> Cuenca', () => {
    expect(lookupEcuadorNseRegion('Azuay', 'Cuenca', 'Cuenca')).toBe('Cuenca')
  })

  it('Manabí / Manta / Manta -> Manta Porto Viejo', () => {
    // Contract doc spells this "Manta–Portoviejo"; the actual imported catalog region
    // name is "Manta Porto Viejo" (ECUADOR_REGIONS) — asserting the real value.
    expect(lookupEcuadorNseRegion('Manabí', 'Manta', 'Manta')).toBe('Manta Porto Viejo')
  })

  it('Santo Domingo de los Tsáchilas / Santo Domingo, no parroquia -> Santo Domingo (cantón-only fallback)', () => {
    expect(lookupEcuadorNseRegion('Santo Domingo de los Tsáchilas', 'Santo Domingo', null)).toBe(
      'Santo Domingo',
    )
  })

  it('Loja / Loja / Loja -> Sierra (contract doc predicted null as "not in sample"; the imported catalog does include it)', () => {
    expect(lookupEcuadorNseRegion('Loja', 'Loja', 'Loja')).toBe('Sierra')
  })

  it('a genuinely off-catalog provincia/cantón combination -> null (out of geographic quota)', () => {
    expect(lookupEcuadorNseRegion('Provincia Inexistente', 'Cantón Inexistente', null)).toBeNull()
  })
})

describe('lookupEcuadorNseRegion — input edge cases', () => {
  it('null stateProvince or municipality -> null, regardless of neighborhood', () => {
    expect(lookupEcuadorNseRegion(null, 'Cuenca', 'Cuenca')).toBeNull()
    expect(lookupEcuadorNseRegion('Azuay', null, 'Cuenca')).toBeNull()
  })

  it('every resolved region is one of the 12 known ECUADOR_REGIONS', () => {
    const region = lookupEcuadorNseRegion('Azuay', 'Cuenca', 'Cuenca')
    expect(region).not.toBeNull()
    expect(ECUADOR_REGIONS as readonly string[]).toContain(region)
  })
})

// >=30-address fixture toward SC-003 — a deterministic random sample straight from the
// real catalog file, asserting every one resolves to exactly its own recorded region via
// the public lookup function (stateProvince/municipality/neighborhood = provincia/canton/
// parroquiaUrbana, matching how gps-capture.ts and the manual geo flow call it).
describe('lookupEcuadorNseRegion — >=30-address catalog sweep (SC-003)', () => {
  interface Row {
    region: string
    provincia: string
    canton: string
    parroquia: string
    parroquiaUrbana: string
  }
  const regions = (catalogJson as { regions: Row[] }).regions

  // Deterministic pseudo-random sample (mulberry32) so the fixture is stable across runs
  // without depending on Math.random or a test-order-sensitive slice.
  function mulberry32(seed: number) {
    return () => {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const rand = mulberry32(20260904)
  const sampleSize = 32
  const sample: Row[] = []
  const pool = [...regions]
  for (let i = 0; i < sampleSize && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    sample.push(pool.splice(idx, 1)[0])
  }

  it('samples at least 30 addresses', () => {
    expect(sample.length).toBeGreaterThanOrEqual(30)
  })

  it.each(sample.map((row, i) => [i, row] as const))(
    'address #%d (%s / %s) resolves to its recorded region',
    (_i, row) => {
      const result = lookupEcuadorNseRegion(row.provincia, row.canton, row.parroquiaUrbana || row.parroquia)
      expect(result).toBe(row.region)
    },
  )
})
