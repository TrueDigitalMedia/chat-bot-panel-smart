import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionCapProgress } from '@/lib/quotas/region-caps'

// Spec 014 T037 — `checkQuotaAvailability` needs NO code change for Ecuador: it's already
// generic over country/region/segment (spec 011). This suite proves that by exercising it
// with Ecuador inputs (region names from ecuador-nse-catalog.ts, NSE levels AB/C/D-E
// instead of CAM's Nivel 1-4) through the exact same harness as tests/unit/quota-check.test.ts.

vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: {} }))

const progressByKey = new Map<string, QuotaProgress>()
let regionCap: RegionCapProgress | null = null
let highestVolumeTarget: { dimensionType: string; dimensionValue: string } | null = null

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
  getHighestVolumeTarget: vi.fn(async () => highestVolumeTarget),
}))

vi.mock('@/lib/quotas/region-caps', () => ({
  getRegionCapProgress: vi.fn(async () => regionCap),
}))

import { checkQuotaAvailability } from '@/lib/scoring/quota'

const ECUADOR_CUENCA = { country: 'Ecuador', region: 'Cuenca', nseRegion: 'Cuenca' }
const ECUADOR_GUAYAQUIL_NORTE = { country: 'Ecuador', region: 'Guayaquil Norte', nseRegion: 'Guayaquil Norte' }

describe('checkQuotaAvailability — Ecuador (spec 014 T037, no code change from spec 011)', () => {
  beforeEach(() => {
    progressByKey.clear()
    regionCap = null
    highestVolumeTarget = null
  })

  it('qualifies via the Ecuador "AB" NSE dimension (not a CAM "Nivel N" value)', async () => {
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'nse', dimensionValue: 'AB', target: 10, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'AB',
      age: 30,
      householdSize: 4,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'AB' })
  })

  it('qualifies via the Ecuador "D/E" NSE dimension', async () => {
    seedProgress({ ...ECUADOR_GUAYAQUIL_NORTE, dimensionType: 'nse', dimensionValue: 'D/E', target: 5, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...ECUADOR_GUAYAQUIL_NORTE,
      segment: 'D/E',
      age: 50,
      householdSize: 2,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'D/E' })
  })

  it('falls through to edad/integrantes (shared bands, FR-012) when the Ecuador NSE cell is exhausted', async () => {
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'nse', dimensionValue: 'C', target: 5, achieved: 5 })
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'edad', dimensionValue: '50+', target: 5, achieved: 0 })

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'C',
      age: 55,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'edad', matchedValue: '50+' })
  })

  it('does not qualify when nse, edad, and integrantes are all exhausted for the Ecuador region', async () => {
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'nse', dimensionValue: 'AB', target: 5, achieved: 5 })
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'edad', dimensionValue: 'Hasta 34', target: 5, achieved: 5 })
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'integrantes', dimensionValue: '1 a 2', target: 5, achieved: 5 })

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'AB',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null })
  })

  it('the Ecuador region aggregate cap blocks an otherwise-qualifying lead once reached', async () => {
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'nse', dimensionValue: 'C', target: 10, achieved: 0 })
    regionCap = { cap: 20, achieved: 20 }

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'C',
      age: 30,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: false, matchedDimension: null, matchedValue: null })
  })

  it('an Ecuador household reporting a pregnancy qualifies via the exception even with every dimension exhausted', async () => {
    seedProgress({ ...ECUADOR_CUENCA, dimensionType: 'nse', dimensionValue: 'AB', target: 5, achieved: 5 })
    highestVolumeTarget = null // no active cell to attribute to — falls back to the unattributed marker

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'AB',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null })
  })

  it('a baby-under-3 Ecuador household attributes to the region\'s highest-volume active cell instead of going unattributed', async () => {
    highestVolumeTarget = { dimensionType: 'nse', dimensionValue: 'C' }

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'AB',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'C' })
  })

  it('the pregnancy/baby exception is never blocked by an Ecuador region cap that has already been reached', async () => {
    regionCap = { cap: 10, achieved: 10 }

    const result = await checkQuotaAvailability({
      ...ECUADOR_CUENCA,
      segment: 'AB',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(true)
  })
})
