import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionObjective } from '@/lib/quotas/region-caps'

// Spec 015 T030 — `checkQuotaAvailability` needs NO code change for Ecuador: it's already
// generic over country/region/segment (spec 011). This suite proves that by exercising it
// with México inputs (Kantar region names, 5 AMAI levels AB/C+/C/D+/D-E) through the exact same harness as tests/unit/quota-check.test.ts.

vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: {} }))

const PERIOD_ID = 'period-q4'
const progressByKey = new Map<string, QuotaProgress>()
let regionObjective: RegionObjective = { objective: 1000, source: 'cap', achieved: 0, deactivated: false }
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
    periodId: PERIOD_ID,
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
    async (periodId: string, country: string, region: string, dimensionType: string, dimensionValue: string) => {
      if (periodId !== PERIOD_ID) return null
      return progressByKey.get(key(country, region, dimensionType, dimensionValue)) ?? null
    },
  ),
  getHighestVolumeNseTargetWithRoom: vi.fn(async (periodId: string) =>
    periodId === PERIOD_ID ? openNseLine : null,
  ),
}))

vi.mock('@/lib/quotas/region-caps', () => ({
  getRegionObjective: vi.fn(async () => regionObjective),
}))

// Spec 018: el país necesita un periodo abierto para que algo califique.
vi.mock('@/lib/quotas/quota-periods', () => ({
  getOpenPeriod: vi.fn(async (country: string) => ({
    id: PERIOD_ID,
    country,
    label: 'Q4 2026',
    year: 2026,
    quarter: 4,
    startsOn: '2026-10-01',
    endsOn: '2026-12-31',
    status: 'open',
    openedAt: new Date('2026-10-01T00:00:00Z'),
    closedAt: null,
    notes: null,
  })),
}))

import { checkQuotaAvailability } from '@/lib/scoring/quota'

const MX_AMCM = { country: 'México', region: 'AMCM', nseRegion: 'AMCM' }
const MX_CENTRO = { country: 'México', region: 'CENTRO', nseRegion: 'CENTRO' }

describe('checkQuotaAvailability — México (spec 015 T030, no code change from spec 011)', () => {
  beforeEach(() => {
    progressByKey.clear()
    regionObjective = { objective: 1000, source: 'cap', achieved: 0, deactivated: false }
    openNseLine = null
  })

  it('qualifies via the México "C+" NSE dimension (a 5-band AMAI value, not CAM Nivel N)', async () => {
    seedProgress({ ...MX_AMCM, dimensionType: 'nse', dimensionValue: 'C+', target: 10, achieved: 0 })
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'C+', age: 30, householdSize: 4, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'C+',
      periodId: PERIOD_ID,
    })
  })

  it('qualifies via "D/E" for México', async () => {
    seedProgress({ ...MX_CENTRO, dimensionType: 'nse', dimensionValue: 'D/E', target: 5, achieved: 0 })
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'D/E', age: 50, householdSize: 2, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'D/E',
      periodId: PERIOD_ID,
    })
  })

  it('own NSE cell exhausted + integrantes demand → charged to another México NSE line with room', async () => {
    seedProgress({ ...MX_AMCM, dimensionType: 'nse', dimensionValue: 'D+', target: 5, achieved: 5 })
    seedProgress({ ...MX_AMCM, dimensionType: 'integrantes', dimensionValue: '5+', target: 5, achieved: 0 })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'C+' }
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'D+', age: 40, householdSize: 6, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'C+',
      periodId: PERIOD_ID,
    })
  })

  it('does not qualify when nse, edad, and integrantes are all exhausted for the México region', async () => {
    seedProgress({ ...MX_AMCM, dimensionType: 'nse', dimensionValue: 'AB', target: 5, achieved: 5 })
    seedProgress({ ...MX_AMCM, dimensionType: 'edad', dimensionValue: 'Hasta 34', target: 5, achieved: 5 })
    seedProgress({ ...MX_AMCM, dimensionType: 'integrantes', dimensionValue: '1 a 2', target: 5, achieved: 5 })
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'AB', age: 20, householdSize: 1, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null, deniedReason: 'region_completa',
      periodId: null,
    })
  })

  it('the México region objective blocks an otherwise-qualifying lead once reached', async () => {
    seedProgress({ ...MX_CENTRO, dimensionType: 'nse', dimensionValue: 'C', target: 10, achieved: 0 })
    regionObjective = { objective: 20, source: 'cap', achieved: 20, deactivated: false }
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'C', age: 30, householdSize: 3, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null, deniedReason: 'region_completa',
      periodId: null,
    })
  })

  it('a baby-under-36-months México household qualifies via the exception even with every dimension exhausted', async () => {
    seedProgress({ ...MX_CENTRO, dimensionType: 'nse', dimensionValue: 'D+', target: 5, achieved: 5 })
    openNseLine = null
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'D+', age: 20, householdSize: 1, isPregnant: false, hasBabyUnder3: true,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null,
      periodId: PERIOD_ID,
    })
  })

  it('a pregnant México household attributes to the region\'s highest-volume active cell', async () => {
    openNseLine = { dimensionType: 'nse', dimensionValue: 'C' }
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'AB', age: 20, householdSize: 1, isPregnant: true, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'C',
      periodId: PERIOD_ID,
    })
  })

  it('the exception IS blocked once the México region objective is reached (PUNTO 1)', async () => {
    regionObjective = { objective: 10, source: 'cap', achieved: 10, deactivated: false }
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'AB', age: 20, householdSize: 1, isPregnant: false, hasBabyUnder3: true,
    })
    expect(result.qualifies).toBe(false)
    expect(result.deniedReason).toBe('region_completa')
  })
})
