import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionObjective } from '@/lib/quotas/region-caps'

// Spec 015 T030 — `checkQuotaAvailability` needs NO code change for Ecuador: it's already
// generic over country/region/segment (spec 011). This suite proves that by exercising it
// with México inputs (Kantar region names, 5 AMAI levels AB/C+/C/D+/D-E) through the exact same harness as tests/unit/quota-check.test.ts.

vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: {} }))

const progressByKey = new Map<string, QuotaProgress>()
let regionObjective: RegionObjective = { objective: 1000, source: 'cap', achieved: 0 }
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

import { checkQuotaAvailability } from '@/lib/scoring/quota'

const MX_AMCM = { country: 'México', region: 'AMCM', nseRegion: 'AMCM' }
const MX_CENTRO = { country: 'México', region: 'CENTRO', nseRegion: 'CENTRO' }

describe('checkQuotaAvailability — México (spec 015 T030, no code change from spec 011)', () => {
  beforeEach(() => {
    progressByKey.clear()
    regionObjective = { objective: 1000, source: 'cap', achieved: 0 }
    highestVolumeNseTarget = null
  })

  it('qualifies via the México "C+" NSE dimension (a 5-band AMAI value, not CAM Nivel N)', async () => {
    seedProgress({ ...MX_AMCM, dimensionType: 'nse', dimensionValue: 'C+', target: 10, achieved: 0 })
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'C+', age: 30, householdSize: 4, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'C+' })
  })

  it('qualifies via "D/E" for México', async () => {
    seedProgress({ ...MX_CENTRO, dimensionType: 'nse', dimensionValue: 'D/E', target: 5, achieved: 0 })
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'D/E', age: 50, householdSize: 2, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'D/E' })
  })

  it('falls through to edad/integrantes (shared bands) when the México NSE cell is exhausted', async () => {
    seedProgress({ ...MX_AMCM, dimensionType: 'nse', dimensionValue: 'D+', target: 5, achieved: 5 })
    seedProgress({ ...MX_AMCM, dimensionType: 'integrantes', dimensionValue: '5+', target: 5, achieved: 0 })
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'D+', age: 40, householdSize: 6, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'integrantes', matchedValue: '5+' })
  })

  it('does not qualify when nse, edad, and integrantes are all exhausted for the México region', async () => {
    seedProgress({ ...MX_AMCM, dimensionType: 'nse', dimensionValue: 'AB', target: 5, achieved: 5 })
    seedProgress({ ...MX_AMCM, dimensionType: 'edad', dimensionValue: 'Hasta 34', target: 5, achieved: 5 })
    seedProgress({ ...MX_AMCM, dimensionType: 'integrantes', dimensionValue: '1 a 2', target: 5, achieved: 5 })
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'AB', age: 20, householdSize: 1, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null, deniedReason: 'sin_cupo' })
  })

  it('the México region objective blocks an otherwise-qualifying lead once reached', async () => {
    seedProgress({ ...MX_CENTRO, dimensionType: 'nse', dimensionValue: 'C', target: 10, achieved: 0 })
    regionObjective = { objective: 20, source: 'cap', achieved: 20 }
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'C', age: 30, householdSize: 3, isPregnant: false, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null, deniedReason: 'region_completa' })
  })

  it('a baby-under-36-months México household qualifies via the exception even with every dimension exhausted', async () => {
    seedProgress({ ...MX_CENTRO, dimensionType: 'nse', dimensionValue: 'D+', target: 5, achieved: 5 })
    highestVolumeNseTarget = null
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'D+', age: 20, householdSize: 1, isPregnant: false, hasBabyUnder3: true,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null })
  })

  it('a pregnant México household attributes to the region\'s highest-volume active cell', async () => {
    highestVolumeNseTarget = { dimensionType: 'nse', dimensionValue: 'C' }
    const result = await checkQuotaAvailability({
      ...MX_AMCM, segment: 'AB', age: 20, householdSize: 1, isPregnant: true, hasBabyUnder3: false,
    })
    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'C' })
  })

  it('the exception IS blocked once the México region objective is reached (PUNTO 1)', async () => {
    regionObjective = { objective: 10, source: 'cap', achieved: 10 }
    const result = await checkQuotaAvailability({
      ...MX_CENTRO, segment: 'AB', age: 20, householdSize: 1, isPregnant: false, hasBabyUnder3: true,
    })
    expect(result.qualifies).toBe(false)
    expect(result.deniedReason).toBe('region_completa')
  })
})
