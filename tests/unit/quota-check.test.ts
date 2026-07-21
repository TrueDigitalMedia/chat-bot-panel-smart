import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionCapProgress } from '@/lib/quotas/region-caps'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import quota.ts's dependency chain.
vi.mock('@/lib/db/client', () => ({ db: {} }))
// scoring/quota.ts pulls in tdm-mysql/sync.ts -> tdm-mysql/client.ts -> env.ts (spec 010),
// whose eager validateEnv() would otherwise throw without real credentials.
vi.mock('@/lib/env', () => ({
  env: { CLIENT_MYSQL_SYNC_ENABLED: false },
  isClientMysqlConfigured: () => false,
  isClientMysqlSyncEnabled: () => false,
}))

const progressByKey = new Map<string, QuotaProgress>()
let regionCap: RegionCapProgress | null = null

function key(country: string, region: string, dimensionType: string, dimensionValue: string): string {
  return `${country}|${region}|${dimensionType}|${dimensionValue}`
}

function seedProgress(p: Pick<QuotaProgress, 'country' | 'region' | 'dimensionType' | 'dimensionValue' | 'target' | 'achieved'> & { active?: boolean }) {
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
  getQuotaProgressForTarget: vi.fn(async (country: string, region: string, dimensionType: string, dimensionValue: string) => {
    return progressByKey.get(key(country, region, dimensionType, dimensionValue)) ?? null
  }),
}))

vi.mock('@/lib/quotas/region-caps', () => ({
  getRegionCapProgress: vi.fn(async () => regionCap),
}))

vi.mock('@/lib/tdm-mysql/sync', () => ({
  syncLeadPhase1Complete: vi.fn(async () => {}),
}))

import { checkQuotaAvailability } from '@/lib/scoring/quota'

const HONDURAS_NOR_OCCIDENTE_I = { country: 'Honduras', region: 'Nor Occidente I', nseRegion: 'Nor Occidente I' }
const HONDURAS_CENTRO_I = { country: 'Honduras', region: 'Centro I', nseRegion: 'Centro I' }

describe('checkQuotaAvailability — OR-matching across dimensions (spec 011 US1)', () => {
  beforeEach(() => {
    progressByKey.clear()
    regionCap = null
  })

  it('qualifies via integrantes when NSE and edad are exhausted (Honduras Nor Occidente I example)', async () => {
    seedProgress({ ...HONDURAS_NOR_OCCIDENTE_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 0, achieved: 0 })
    seedProgress({ ...HONDURAS_NOR_OCCIDENTE_I, dimensionType: 'edad', dimensionValue: '50+', target: 0, achieved: 0 })
    seedProgress({ ...HONDURAS_NOR_OCCIDENTE_I, dimensionType: 'integrantes', dimensionValue: '5+', target: 22, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HONDURAS_NOR_OCCIDENTE_I,
      segment: 'Nivel 1',
      age: 55,
      householdSize: 6,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'integrantes', matchedValue: '5+' })
  })

  it('qualifies via NSE when edad and integrantes are exhausted (Honduras Centro I example)', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'edad', dimensionValue: '35 a 49', target: 0, achieved: 0 })
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'integrantes', dimensionValue: '3 a 4', target: 0, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 4',
      age: 40,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 4' })
  })

  it('does not qualify when NSE, edad, and integrantes are all exhausted', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 5, achieved: 5 })
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'edad', dimensionValue: 'Hasta 34', target: 5, achieved: 5 })
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'integrantes', dimensionValue: '1 a 2', target: 5, achieved: 5 })

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null })
  })

  it('evaluates in fixed order nse -> edad -> integrantes, preferring NSE when multiple dimensions have room', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 2', target: 10, achieved: 0 })
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'edad', dimensionValue: '35 a 49', target: 10, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 2',
      age: 40,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.matchedDimension).toBe('nse')
  })

  it('treats a row with active=false as unavailable even when target > achieved', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 3', target: 10, achieved: 0, active: false })

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 3',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
  })

  it('does not error when age/householdSize are null — those dimensions are simply unmatchable', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 3', target: 0, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 3',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null })
  })
})

describe('checkQuotaAvailability — pregnancy/baby-under-3 exception (spec 011 US3)', () => {
  beforeEach(() => {
    progressByKey.clear()
    regionCap = null
  })

  it('qualifies via exception when isPregnant is true, even with every dimension exhausted', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 0, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null })
  })

  it('qualifies via exception when hasBabyUnder3 is true', async () => {
    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null })
  })

  it('is never blocked by a region cap that has already been reached', async () => {
    regionCap = { cap: 10, achieved: 10 }

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(true)
    expect(result.matchedDimension).toBe('exception')
  })
})

describe('checkQuotaAvailability — region aggregate cap (spec 011 US4)', () => {
  beforeEach(() => {
    progressByKey.clear()
    regionCap = null
  })

  it('blocks an otherwise-qualifying lead once the region cap is reached', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })
    regionCap = { cap: 50, achieved: 50 }

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 4',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null })
  })

  it('proceeds to dimension evaluation when the region cap has not been reached', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })
    regionCap = { cap: 50, achieved: 30 }

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 4',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 4' })
  })

  it('never blocks when cap_count is null ("sin tope")', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })
    regionCap = { cap: null, achieved: 999 }

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 4',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(true)
  })

  it('never blocks when no region cap row is configured at all', async () => {
    seedProgress({ ...HONDURAS_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 4', target: 16, achieved: 0 })
    regionCap = null

    const result = await checkQuotaAvailability({
      ...HONDURAS_CENTRO_I,
      segment: 'Nivel 4',
      age: null,
      householdSize: null,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(true)
  })
})
