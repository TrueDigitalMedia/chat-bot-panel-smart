import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionObjective } from '@/lib/quotas/region-caps'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import quota.ts's dependency chain.
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: {} }))

const progressByKey = new Map<string, QuotaProgress>()
/** The region objective (PUNTO 1) — the single hard ceiling. Default: wide open. */
let regionObjective: RegionObjective = { objective: 1000, source: 'cap', achieved: 0 }
/** The highest-volume NSE line in the region that STILL HAS ROOM (null = all lines full). */
let openNseLine: { dimensionType: string; dimensionValue: string } | null = null

function key(country: string, region: string, dimensionType: string, dimensionValue: string): string {
  return `${country}|${region}|${dimensionType}|${dimensionValue}`
}

function seedProgress(
  p: Pick<QuotaProgress, 'country' | 'region' | 'dimensionType' | 'dimensionValue' | 'target' | 'achieved'> & {
    active?: boolean
  },
) {
  const available = Math.max(0, p.target - p.achieved)
  progressByKey.set(key(p.country, p.region, p.dimensionType, p.dimensionValue), {
    id: 'x',
    country: p.country,
    region: p.region,
    dimensionType: p.dimensionType,
    dimensionValue: p.dimensionValue,
    target: p.target,
    achieved: p.achieved,
    available,
    active: p.active ?? true,
    notes: null,
    progressPct: 0,
    updatedAt: new Date(),
  })
}

vi.mock('@/lib/quotas/quota-progress', () => ({
  getQuotaProgressForTarget: vi.fn(
    async (country: string, region: string, dimensionType: string, dimensionValue: string) => {
      return progressByKey.get(key(country, region, dimensionType, dimensionValue)) ?? null
    },
  ),
  getHighestVolumeNseTargetWithRoom: vi.fn(async () => openNseLine),
}))

vi.mock('@/lib/quotas/region-caps', () => ({
  getRegionObjective: vi.fn(async () => regionObjective),
}))

import { checkQuotaAvailability, describeQuotaMatch } from '@/lib/scoring/quota'

const HN_NOR_OCC_I = { country: 'Honduras', region: 'Nor Occidente I', nseRegion: 'Nor Occidente I' }
const HN_CENTRO_I = { country: 'Honduras', region: 'Centro I', nseRegion: 'Centro I' }

function resetState() {
  progressByKey.clear()
  regionObjective = { objective: 1000, source: 'cap', achieved: 0 }
  openNseLine = null
}

describe('checkQuotaAvailability — region objective is the hard ceiling (PUNTO 1)', () => {
  beforeEach(resetState)

  it('does NOT qualify when the region has no objective configured (out of the client sample)', async () => {
    regionObjective = { objective: 0, source: 'none', achieved: 0 }
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 4',
      age: 40,
      householdSize: 3,
      isPregnant: true, // even the exception cannot open a closed region
      hasBabyUnder3: false,
    })

    expect(result).toEqual({
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_fuera_de_muestra',
    })
  })

  it('does NOT qualify when there is no identified region at all', async () => {
    const result = await checkQuotaAvailability({
      country: 'Honduras',
      nseRegion: '',
      segment: 'Nivel 2',
      age: 30,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_no_identificada',
    })
  })

  it('does NOT qualify once the region objective is reached — plain NSE lead', async () => {
    regionObjective = { objective: 93, source: 'cap', achieved: 93 }
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 2' }

    const result = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 2',
      age: 30,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.deniedReason).toBe('region_completa')
  })

  it('a conditional lead in a closed region does NOT borrow cupo from another region', async () => {
    // Lead lives in Centro I (objetivo 0). Centro II / Nivel 1 has room — irrelevant:
    // the region is fixed by geo and cross-region borrowing never happens.
    regionObjective = { objective: 0, source: 'none', achieved: 0 }
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 1' } // "some other region has room"

    const byException = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 55,
      householdSize: 6,
      isPregnant: true,
      hasBabyUnder3: false,
    })
    const byBand = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 55,
      householdSize: 6,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(byException.deniedReason).toBe('region_fuera_de_muestra')
    expect(byBand.deniedReason).toBe('region_fuera_de_muestra')
  })

  it('does NOT qualify once the region objective is reached — even with pregnancy / baby', async () => {
    regionObjective = { objective: 14, source: 'cap', achieved: 14 }

    const pregnant = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 4',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(pregnant.qualifies).toBe(false)
    expect(pregnant.deniedReason).toBe('region_completa')
  })
})

describe('checkQuotaAvailability — per NSE line is ALSO a hard cap (PUNTO 1, El Salvador Centro II)', () => {
  beforeEach(resetState)

  it('the lead\'s own NSE line books that exact line while it has room', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 14, achieved: 5 })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 4' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 4',
      age: 40,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 4' })
  })

  it('an NSE lead whose own line is FULL does not qualify by NSE (line stays at its objective)', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 14, achieved: 14 })
    openNseLine = null // no other line has room either

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 4',
      age: 40,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
  })

  it('own NSE line full + edad has demand → CHARGED to another NSE line that still has room', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 14, achieved: 14 })
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'edad', dimensionValue: '50+', target: 30, achieved: 0 })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 1' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 4',
      age: 55,
      householdSize: 2,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 1' })
  })

  it('own NSE line full + edad has demand but NO NSE line has room → does not qualify', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 14, achieved: 14 })
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'edad', dimensionValue: '50+', target: 30, achieved: 0 })
    openNseLine = null

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 4',
      age: 55,
      householdSize: 2,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
    expect(result.deniedReason).toBe('region_completa')
  })

  it('does not qualify when the own NSE line is full and no edad/integrantes demand', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 5, achieved: 5 })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 2' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'sin_cupo',
    })
  })

  it('treats an inactive NSE line as unavailable', async () => {
    seedProgress({
      ...HN_CENTRO_I,
      dimensionType: 'nse',
      dimensionValue: 'Nivel 3',
      target: 10,
      achieved: 0,
      active: false,
    })
    openNseLine = null

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 3',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
  })
})

describe('checkQuotaAvailability — pregnancy / baby-under-3 exception', () => {
  beforeEach(resetState)

  it('qualifies (own dimensions ignored), charged to the highest-volume NSE line with room', async () => {
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 2' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 2' })
  })

  it('falls back to the unattributed exception marker only for a manual-cap region with no NSE lines', async () => {
    regionObjective = { objective: 20, source: 'cap', achieved: 3 }
    openNseLine = null

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null })
  })

  it('IS blocked when every NSE line of the region is full (nse_sum objective)', async () => {
    regionObjective = { objective: 44, source: 'nse_sum', achieved: 30 }
    openNseLine = null

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
    expect(result.deniedReason).toBe('region_completa')
  })
})

describe('checkQuotaAvailability — prod scenarios (dump 2026-09-10, docs/whatsapp/cam-rd-quota-over-delivery-2026-09-10.md)', () => {
  beforeEach(resetState)

  it('Panamá / Centro I (objetivo 57, entregó 93): a new lead — NSE, edad, integrantes or exception — does NOT qualify', async () => {
    regionObjective = { objective: 57, source: 'cap', achieved: 93 }
    // every NSE line already at/over target
    openNseLine = null

    const cases = [
      { isPregnant: false, hasBabyUnder3: false, age: 25, householdSize: 4 }, // NSE / edad "Hasta 34"
      { isPregnant: true, hasBabyUnder3: false, age: 25, householdSize: 4 }, // exception
      { isPregnant: false, hasBabyUnder3: true, age: 55, householdSize: 6 }, // exception
    ]
    for (const c of cases) {
      const r = await checkQuotaAvailability({
        country: 'Panamá',
        region: 'Centro I',
        nseRegion: 'Centro I',
        segment: 'Nivel 4',
        ...c,
      })
      expect(r.qualifies).toBe(false)
      expect(r.deniedReason).toBe('region_completa')
    }
  })

  it('El Salvador / Centro I (fuera de muestra, objetivo 0): closed for everyone', async () => {
    regionObjective = { objective: 0, source: 'none', achieved: 9 }

    const r = await checkQuotaAvailability({
      country: 'El Salvador',
      region: 'Centro I',
      nseRegion: 'Centro I',
      segment: 'Nivel 1',
      age: 30,
      householdSize: 3,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(r).toEqual({
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_fuera_de_muestra',
    })
  })
})

describe('describeQuotaMatch', () => {
  it('describes an nse match with its value', () => {
    expect(describeQuotaMatch('nse', 'Nivel 2')).toBe('nivel socioeconómico (NSE): Nivel 2')
  })

  it('describes an edad match with its value', () => {
    expect(describeQuotaMatch('edad', 'Hasta 34')).toBe('rango de edad: Hasta 34')
  })

  it('describes the pregnancy/baby-under-3 exception without a value', () => {
    expect(describeQuotaMatch('exception', null)).toBe('excepción por embarazo o bebé menor a 36 meses')
  })

  it('returns null when there is no match', () => {
    expect(describeQuotaMatch(null, null)).toBeNull()
  })
})
