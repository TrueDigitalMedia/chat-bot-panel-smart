import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionObjective } from '@/lib/quotas/region-caps'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import quota.ts's dependency chain.
vi.mock('@/lib/db/client', () => ({ db: {} }))
// db/client.ts's eager module load would otherwise throw without real credentials.
vi.mock('@/lib/env', () => ({
  env: {},
}))

const progressByKey = new Map<string, QuotaProgress>()
/** The region objective (PUNTO 1) — the single hard ceiling. Default: wide open. */
let regionObjective: RegionObjective = { objective: 1000, source: 'cap', achieved: 0 }
/** The region's highest-volume NSE line, for exception / edad / integrantes attribution. */
let highestVolumeNseTarget: { dimensionType: string; dimensionValue: string } | null = null

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
  getHighestVolumeNseTarget: vi.fn(async () => highestVolumeNseTarget),
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
  highestVolumeNseTarget = null
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

  it('does NOT qualify when the region has no identified region at all', async () => {
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

  it('does NOT qualify once the region objective is reached — for a plain NSE lead', async () => {
    regionObjective = { objective: 93, source: 'cap', achieved: 93 }
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'nse', dimensionValue: 'Nivel 2', target: 40, achieved: 10 })

    const result = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
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
      deniedReason: 'region_completa',
    })
  })

  it('does NOT qualify once the region objective is reached — even with pregnancy / baby exception', async () => {
    regionObjective = { objective: 14, source: 'cap', achieved: 14 }

    const pregnant = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 4',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })
    const baby = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 4',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(pregnant.qualifies).toBe(false)
    expect(pregnant.deniedReason).toBe('region_completa')
    expect(baby.qualifies).toBe(false)
  })

  it('does NOT qualify once the region objective is reached — even with edad/integrantes room', async () => {
    regionObjective = { objective: 50, source: 'nse_sum', achieved: 50 }
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 0, achieved: 0 })
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'integrantes', dimensionValue: '5+', target: 22, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 1',
      age: 55,
      householdSize: 6,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
    expect(result.deniedReason).toBe('region_completa')
  })
})

describe('checkQuotaAvailability — within a region that still has room', () => {
  beforeEach(resetState)

  it('qualifies by its own NSE line when it has room', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })

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

  it('prefers NSE over edad/integrantes when several dimensions have room', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 2', target: 10, achieved: 0 })
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'edad', dimensionValue: '35 a 49', target: 10, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 2',
      age: 40,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.matchedDimension).toBe('nse')
    expect(result.matchedValue).toBe('Nivel 2')
  })

  it('when the own NSE line is full, an edad match is CHARGED TO the highest-volume NSE line', async () => {
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 5, achieved: 5 })
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'edad', dimensionValue: '50+', target: 22, achieved: 0 })
    highestVolumeNseTarget = { dimensionType: 'nse', dimensionValue: 'Nivel 3' }

    const result = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 1',
      age: 55,
      householdSize: 2,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 3' })
  })

  it('an integrantes match with no NSE line at all falls back to the integrantes attribution', async () => {
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'integrantes', dimensionValue: '5+', target: 22, achieved: 0 })
    highestVolumeNseTarget = null

    const result = await checkQuotaAvailability({
      ...HN_NOR_OCC_I,
      segment: 'Nivel 1',
      age: 55,
      householdSize: 6,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'integrantes', matchedValue: '5+' })
  })

  it('does not qualify when NSE, edad and integrantes are all exhausted (region still open)', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 5, achieved: 5 })
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'edad', dimensionValue: 'Hasta 34', target: 5, achieved: 5 })
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'integrantes', dimensionValue: '1 a 2', target: 5, achieved: 5 })

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

  it('does not error when age / householdSize are null', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 3', target: 0, achieved: 0 })

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

  it('qualifies with every dimension exhausted, charged to the highest-volume NSE line', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 0, achieved: 0 })
    highestVolumeNseTarget = { dimensionType: 'nse', dimensionValue: 'Nivel 2' }

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

  it('falls back to the unattributed exception marker when the region has no NSE line', async () => {
    highestVolumeNseTarget = null

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
})

describe('describeQuotaMatch', () => {
  it('describes an nse match with its value', () => {
    expect(describeQuotaMatch('nse', 'Nivel 2')).toBe('nivel socioeconómico (NSE): Nivel 2')
  })

  it('describes an edad match with its value', () => {
    expect(describeQuotaMatch('edad', 'Hasta 34')).toBe('rango de edad: Hasta 34')
  })

  it('describes an integrantes match with its value', () => {
    expect(describeQuotaMatch('integrantes', '5+')).toBe('número de integrantes del hogar: 5+')
  })

  it('describes the pregnancy/baby-under-3 exception without a value', () => {
    expect(describeQuotaMatch('exception', null)).toBe('excepción por embarazo o bebé menor a 36 meses')
  })

  it('returns null when there is no match', () => {
    expect(describeQuotaMatch(null, null)).toBeNull()
  })

  it('returns null for an unrecognized dimension', () => {
    expect(describeQuotaMatch('unknown', 'x')).toBeNull()
  })
})
