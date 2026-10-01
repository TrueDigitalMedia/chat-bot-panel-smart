import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'
import type { RegionObjective } from '@/lib/quotas/region-caps'
import type { QuotaPeriodRow } from '@/lib/quotas/quota-periods'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import quota.ts's dependency chain.
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: {} }))

const progressByKey = new Map<string, QuotaProgress>()
/** A region objective fixture — `deactivated` defaults to false, the normal case. */
function objective(
  o: Partial<RegionObjective> & Pick<RegionObjective, 'objective' | 'source' | 'achieved'>,
): RegionObjective {
  return { deactivated: false, ...o }
}

/** The region objective (PUNTO 1) — the single hard ceiling. Default: wide open. */
let regionObjective: RegionObjective = objective({ objective: 1000, source: 'cap', achieved: 0 })
/** The highest-volume NSE line in the region that STILL HAS ROOM (null = all lines full). */
let openNseLine: { dimensionType: string; dimensionValue: string } | null = null

const PERIOD_ID = 'period-q4'
function periodFixture(country: string): QuotaPeriodRow {
  return {
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
  }
}
/**
 * El periodo abierto del país. null = no hay ⇒ el país entero está cerrado (spec 018).
 *
 * El spy va por `vi.hoisted` porque `vi.mock` se iza por encima de las declaraciones del archivo
 * (mismo patrón que quota-region-early-exit.test.ts).
 */
let openPeriod: QuotaPeriodRow | null = periodFixture('Honduras')
const { getOpenPeriod } = vi.hoisted(() => ({ getOpenPeriod: vi.fn() }))

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
      // Una celda de OTRO periodo no debe filtrarse — la regresión más probable de spec 018.
      if (periodId !== PERIOD_ID) return null
      return progressByKey.get(key(country, region, dimensionType, dimensionValue)) ?? null
    },
  ),
  getHighestVolumeNseTargetWithRoom: vi.fn(async (periodId: string) =>
    periodId === PERIOD_ID ? openNseLine : null,
  ),
}))

vi.mock('@/lib/quotas/region-caps', () => ({
  getRegionObjective: vi.fn(async (periodId: string) =>
    periodId === PERIOD_ID ? regionObjective : objective({ objective: 0, source: 'none', achieved: 0 }),
  ),
}))

vi.mock('@/lib/quotas/quota-periods', () => ({ getOpenPeriod }))

import { checkQuotaAvailability, checkRegionQuota, describeQuotaMatch } from '@/lib/scoring/quota'

const HN_NOR_OCC_I = { country: 'Honduras', region: 'Nor Occidente I', nseRegion: 'Nor Occidente I' }
const HN_CENTRO_I = { country: 'Honduras', region: 'Centro I', nseRegion: 'Centro I' }

function resetState() {
  progressByKey.clear()
  regionObjective = objective({ objective: 1000, source: 'cap', achieved: 0 })
  openNseLine = null
  openPeriod = periodFixture('Honduras')
  getOpenPeriod.mockReset()
  getOpenPeriod.mockImplementation(async (country: string) =>
    openPeriod ? { ...openPeriod, country } : null,
  )
}

describe('checkQuotaAvailability — region objective is the hard ceiling (PUNTO 1)', () => {
  beforeEach(resetState)

  it('does NOT qualify when the region has no objective configured (out of the client sample)', async () => {
    regionObjective = objective({ objective: 0, source: 'none', achieved: 0 })
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
      periodId: null,
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
      periodId: null,
    })
  })

  it('does NOT qualify once the region objective is reached — plain NSE lead', async () => {
    regionObjective = objective({ objective: 93, source: 'cap', achieved: 93 })
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
    regionObjective = objective({ objective: 0, source: 'none', achieved: 0 })
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
    regionObjective = objective({ objective: 14, source: 'cap', achieved: 14 })

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

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 4',
      periodId: PERIOD_ID,
    })
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

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 1',
      periodId: PERIOD_ID,
    })
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
      periodId: null,
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
    // No line seeded for the lead's own 'Nivel 1' ⇒ nothing of their own to charge to.
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 2' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 2',
      periodId: PERIOD_ID,
    })
  })

  // 2026-09-25: the exception used to go straight to the region's biggest line even when
  // the lead's own level still had demand, which rewrote the sample's NSE mix — Guatemala /
  // Sur Occidente Chico had 13 of the 20 leads in Nivel 4 actually being Nivel 1-3 people.
  it('books the exception against the lead OWN NSE line when that line still has room', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 2', target: 12, achieved: 6 })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 4' } // bigger line, also open

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 2',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 2',
      periodId: PERIOD_ID,
    })
  })

  it('falls back to the highest-volume line when the lead own NSE line is full', async () => {
    seedProgress({ ...HN_CENTRO_I, dimensionType: 'nse', dimensionValue: 'Nivel 2', target: 12, achieved: 12 })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 4' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 2',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 4',
      periodId: PERIOD_ID,
    })
  })

  it('falls back to the highest-volume line when the lead own NSE line is deactivated', async () => {
    seedProgress({
      ...HN_CENTRO_I,
      dimensionType: 'nse',
      dimensionValue: 'Nivel 2',
      target: 12,
      achieved: 0,
      active: false,
    })
    openNseLine = { dimensionType: 'nse', dimensionValue: 'Nivel 4' }

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 2',
      age: 20,
      householdSize: 1,
      isPregnant: true,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'nse', matchedValue: 'Nivel 4',
      periodId: PERIOD_ID,
    })
  })

  it('falls back to the unattributed exception marker only for a manual-cap region with no NSE lines', async () => {
    regionObjective = objective({ objective: 20, source: 'cap', achieved: 3 })
    openNseLine = null

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 1',
      age: 20,
      householdSize: 1,
      isPregnant: false,
      hasBabyUnder3: true,
    })

    expect(result).toEqual({ qualifies: true, matchedDimension: 'exception', matchedValue: null,
      periodId: PERIOD_ID,
    })
  })

  // Regression (2026-09-23): Rep. Dominicana Santiago / Sureste were deactivated in the admin
  // panel (every NSE line `active = false`) but kept their manual cap row, so getRegionObjective
  // still reported them open as `source: 'cap'` and the exception below kept letting leads into
  // them. getRegionObjective now returns objective 0 for those, which closes the region before
  // the exception is ever considered.
  //
  // Both halves of the exception are covered: only baby-under-3 leads actually leaked in prod
  // (685 profiles answered it vs 83 pregnancies — volume, not logic), but `isPregnant ||
  // hasBabyUnder3` is a single condition, so a pregnancy would have gone through the same door.
  it.each([
    ['a baby-under-3 lead', { isPregnant: false, hasBabyUnder3: true }],
    ['a pregnant lead', { isPregnant: true, hasBabyUnder3: false }],
    ['a pregnant lead who also has a baby under 3', { isPregnant: true, hasBabyUnder3: true }],
  ])('does NOT qualify %s in a deactivated region (objective forced to 0)', async (_label, exception) => {
    regionObjective = objective({ objective: 0, source: 'none', achieved: 16, deactivated: true })
    openNseLine = null

    const result = await checkQuotaAvailability({
      ...HN_CENTRO_I,
      segment: 'Nivel 2',
      age: 30,
      householdSize: 3,
      ...exception,
    })

    expect(result.qualifies).toBe(false)
    expect(result.deniedReason).toBe('region_fuera_de_muestra')
  })

  it('IS blocked when every NSE line of the region is full (nse_sum objective)', async () => {
    regionObjective = objective({ objective: 44, source: 'nse_sum', achieved: 30 })
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
    regionObjective = objective({ objective: 57, source: 'cap', achieved: 93 })
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
        nseRegion: 'Centro I',
        segment: 'Nivel 4',
        ...c,
      })
      expect(r.qualifies).toBe(false)
      expect(r.deniedReason).toBe('region_completa')
    }
  })

  it('El Salvador / Centro I (fuera de muestra, objetivo 0): closed for everyone', async () => {
    regionObjective = objective({ objective: 0, source: 'none', achieved: 9 })

    const r = await checkQuotaAvailability({
      country: 'El Salvador',
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
      periodId: null,
    })
  })
})

// checkRegionQuota is the standalone region-only check the survey flow calls as soon as
// nseRegion resolves (gps-capture.ts's rejectIfRegionClosed) — it MUST agree with
// checkQuotaAvailability's own steps 0-1 for every scenario, since checkQuotaAvailability
// delegates to it internally. These pin that single source of truth.
describe('checkRegionQuota — the early-exit region-only check (PUNTO 1)', () => {
  beforeEach(resetState)

  it('is open when the region objective still has room', async () => {
    regionObjective = objective({ objective: 1000, source: 'cap', achieved: 5 })
    const status = await checkRegionQuota('Honduras', 'Centro I')
    expect(status).toEqual({
      open: true,
      period: expect.objectContaining({ id: PERIOD_ID, status: 'open' }),
      regionObjective: 1000,
      regionAchieved: 5,
      regionSource: 'cap',
    })
  })

  it('is closed (region_completa) once achieved reaches the objective', async () => {
    regionObjective = objective({ objective: 20, source: 'cap', achieved: 20 })
    const status = await checkRegionQuota('Honduras', 'Centro I')
    expect(status).toEqual({
      open: false,
      period: expect.objectContaining({ id: PERIOD_ID, status: 'open' }),
      deniedReason: 'region_completa',
      regionObjective: 20,
      regionAchieved: 20,
      regionSource: 'cap',
    })
  })

  it('is closed (region_fuera_de_muestra) when the region has no objective at all', async () => {
    regionObjective = objective({ objective: 0, source: 'none', achieved: 9 })
    const status = await checkRegionQuota('El Salvador', 'Centro I')
    expect(status).toEqual({
      open: false,
      period: expect.objectContaining({ id: PERIOD_ID, status: 'open' }),
      deniedReason: 'region_fuera_de_muestra',
      regionObjective: 0,
      regionAchieved: 9,
      regionSource: 'none',
    })
  })

  it('is closed (region_no_identificada) for a null nseRegion, without even querying getRegionObjective', async () => {
    const status = await checkRegionQuota('Honduras', null)
    expect(status).toEqual({
      open: false,
      period: expect.objectContaining({ id: PERIOD_ID, status: 'open' }),
      deniedReason: 'region_no_identificada',
      regionObjective: null,
      regionAchieved: null,
      regionSource: null,
    })
  })

  it('agrees with checkQuotaAvailability on every closed-region scenario (same deniedReason, same qualifies: false)', async () => {
    for (const scenario of [
      { objective: 0, source: 'none' as const, achieved: 0 },
      { objective: 10, source: 'cap' as const, achieved: 10 },
      { objective: 10, source: 'nse_sum' as const, achieved: 15 },
    ]) {
      regionObjective = objective({ ...scenario })
      const regionStatus = await checkRegionQuota('Honduras', 'Centro I')
      const fullDecision = await checkQuotaAvailability({
        ...HN_CENTRO_I,
        segment: 'Nivel 1',
        age: 30,
        householdSize: 3,
        isPregnant: true, // even the exception must not save it — PUNTO 1
        hasBabyUnder3: false,
      })
      expect(regionStatus.open).toBe(false)
      expect(fullDecision.qualifies).toBe(false)
      expect(fullDecision.deniedReason).toBe(regionStatus.deniedReason)
    }
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

// Spec 018 — sin periodo abierto el país entero está cerrado. Es la misma clase de bug que el
// incidente de Rep. Dominicana del 2026-09-23: la excepción de embarazo/bebé NO puede ganarle a
// una compuerta que ya cerró, así que se verifica explícitamente con una lead embarazada.
describe('checkQuotaAvailability — sin periodo de cuota abierto (spec 018)', () => {
  beforeEach(resetState)

  it('no califica a nadie y da periodo_cerrado', async () => {
    openPeriod = null
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 100, achieved: 0 })

    const result = await checkQuotaAvailability({
      country: HN_NOR_OCC_I.country,
      nseRegion: HN_NOR_OCC_I.nseRegion,
      segment: 'Nivel 1',
      age: 30,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result).toEqual({
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      periodId: null,
      deniedReason: 'periodo_cerrado',
    })
  })

  it('tampoco califica por la excepción de embarazo o bebé', async () => {
    openPeriod = null
    for (const exception of [
      { isPregnant: true, hasBabyUnder3: false },
      { isPregnant: false, hasBabyUnder3: true },
    ]) {
      const result = await checkQuotaAvailability({
        country: HN_NOR_OCC_I.country,
        nseRegion: HN_NOR_OCC_I.nseRegion,
        segment: 'Nivel 1',
        age: 30,
        householdSize: 3,
        ...exception,
      })
      expect(result.qualifies).toBe(false)
      expect(result.deniedReason).toBe('periodo_cerrado')
      expect(result.periodId).toBeNull()
    }
  })

  it('checkRegionQuota coincide: cerrado, sin periodo y sin consultar el objetivo de región', async () => {
    openPeriod = null
    const status = await checkRegionQuota('Honduras', 'Nor Occidente I')
    expect(status).toEqual({
      open: false,
      deniedReason: 'periodo_cerrado',
      period: null,
      regionObjective: null,
      regionAchieved: null,
      regionSource: null,
    })
  })

  it('resuelve el periodo abierto UNA sola vez por chequeo completo', async () => {
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 100, achieved: 0 })

    await checkQuotaAvailability({
      country: HN_NOR_OCC_I.country,
      nseRegion: HN_NOR_OCC_I.nseRegion,
      segment: 'Nivel 1',
      age: 30,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    // checkQuotaAvailability lo resuelve y se lo pasa a checkRegionQuota; si alguna vez vuelve a
    // resolverlo por su cuenta, cada chequeo de cuota pagaría una query extra por lead.
    expect(getOpenPeriod).toHaveBeenCalledTimes(1)
  })

  it('una celda de OTRO periodo no otorga cupo', async () => {
    // La celda está sembrada en PERIOD_ID; el país abre un periodo distinto.
    seedProgress({ ...HN_NOR_OCC_I, dimensionType: 'nse', dimensionValue: 'Nivel 1', target: 100, achieved: 0 })
    openPeriod = { ...periodFixture('Honduras'), id: 'otro-periodo' }

    const result = await checkQuotaAvailability({
      country: HN_NOR_OCC_I.country,
      nseRegion: HN_NOR_OCC_I.nseRegion,
      segment: 'Nivel 1',
      age: 30,
      householdSize: 3,
      isPregnant: false,
      hasBabyUnder3: false,
    })

    expect(result.qualifies).toBe(false)
  })
})
