import { describe, it, expect, vi, beforeEach } from 'vitest'
import { leads, quotaRegionCaps, quotaTargets } from '@/lib/db/schema'

const eqCalls: [unknown, unknown][] = []

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  return {
    ...actual,
    eq: (...args: [unknown, unknown]) => {
      eqCalls.push(args)
      return actual.eq(...(args as Parameters<typeof actual.eq>))
    },
  }
})

vi.mock('@/lib/quotas/quota-progress', () => ({
  QUALIFIED_STATUSES: ['link_sent', 'waiting_for_code'],
  resolvePeriodIds: vi.fn(async () => [PERIOD_ID]),
}))

vi.mock('@/lib/quotas/quota-periods', () => ({
  getQuotaPeriod: vi.fn(async (id: string) => ({ id, country: 'Honduras', label: 'Q4 2026', status: 'open' })),
}))

const PERIOD_ID = 'period-q4'

/** What the three queries inside getRegionObjective should see, per test. */
const state = {
  capCount: null as number | null,
  achieved: 0,
  /** One row per NSE line of the region: its target and whether it's active. */
  nseLines: [] as { targetCount: number; active: boolean }[],
}

function nseStatsRow() {
  const active = state.nseLines.filter((l) => l.active)
  return {
    lineCount: state.nseLines.length,
    activeLineCount: active.length,
    activeSum: active.reduce((sum, l) => sum + l.targetCount, 0),
  }
}

/**
 * Minimal drizzle stand-in: the rows returned depend on which table `from()` was given —
 * `quota_region_caps` (cap lookup, ends in `.limit()`), `leads` (achieved count, goes
 * through `.innerJoin()`), or `quota_targets` (the NSE line stats, awaited at `.where()`).
 */
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const rows =
            table === quotaRegionCaps
              ? [{ capCount: state.capCount }]
              : table === quotaTargets
                ? [nseStatsRow()]
                : []
          return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) })
        },
        innerJoin: () => ({
          where: () => Promise.resolve(table === leads ? [{ count: state.achieved }] : []),
        }),
      }),
    }),
  },
}))

describe('getRegionObjective — a deactivated region is closed', () => {
  beforeEach(() => {
    state.capCount = null
    state.achieved = 0
    state.nseLines = []
  })

  it('uses the manual cap when the region has active NSE lines', async () => {
    state.capCount = 100
    state.achieved = 16
    state.nseLines = [
      { targetCount: 3, active: true },
      { targetCount: 3, active: true },
    ]

    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective(PERIOD_ID, 'Rep. Dominicana', 'Santiago')).toEqual({
      objective: 100,
      source: 'cap',
      achieved: 16,
      deactivated: false,
    })
  })

  // The 2026-09-23 bug: Santiago (cap 100, 16 qualified) and Sureste (cap 80, 25) had every
  // NSE line deactivated, yet stayed open as `source: 'cap'` — and the pregnancy/baby-under-3
  // exception in scoring/quota.ts kept letting leads into them.
  it('is closed (objective 0) when every NSE line is inactive, even with a manual cap set', async () => {
    state.capCount = 100
    state.achieved = 16
    state.nseLines = [
      { targetCount: 3, active: false },
      { targetCount: 3, active: false },
      { targetCount: 0, active: false },
    ]

    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective(PERIOD_ID, 'Rep. Dominicana', 'Santiago')).toEqual({
      objective: 0,
      source: 'none',
      achieved: 16,
      deactivated: true,
    })
  })

  it('falls back to the Σ of active NSE lines when no cap row exists', async () => {
    state.capCount = null
    state.achieved = 4
    state.nseLines = [
      { targetCount: 10, active: true },
      { targetCount: 8, active: true },
      { targetCount: 5, active: false },
    ]

    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective(PERIOD_ID, 'Honduras', 'Centro I')).toEqual({
      objective: 18,
      source: 'nse_sum',
      achieved: 4,
      deactivated: false,
    })
  })

  it('is closed when there are no NSE lines and no cap', async () => {
    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective(PERIOD_ID, 'Honduras', 'Centro I')).toEqual({
      objective: 0,
      source: 'none',
      achieved: 0,
      deactivated: false,
    })
  })

  it('keeps a manual cap when the region has no NSE lines at all', async () => {
    state.capCount = 20
    state.achieved = 3

    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective(PERIOD_ID, 'Honduras', 'Centro I')).toEqual({
      objective: 20,
      source: 'cap',
      achieved: 3,
      deactivated: false,
    })
  })
})

// Spec 018 — la regresión más probable de todo el cambio: que una línea de OTRO periodo se cuele
// en el objetivo del periodo en curso. El fake de drizzle de este archivo no filtra por periodo
// (solo mira de qué tabla se lee), así que esto se verifica espiando qué condiciones `eq` recibe
// realmente — el mismo patrón de quota-progress-filters.test.ts.
describe('getRegionObjective — está acotado al periodo', () => {
  beforeEach(() => {
    state.capCount = null
    state.achieved = 0
    state.nseLines = []
    eqCalls.length = 0
  })

  it('devuelve cerrado sin consultar nada cuando falta el periodo', async () => {
    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective('', 'Honduras', 'Centro I')).toEqual({
      objective: 0,
      source: 'none',
      achieved: 0,
      deactivated: false,
    })
    expect(eqCalls).toHaveLength(0)
  })

  it('filtra por period_id en las tres consultas: tope, conseguidos y líneas NSE', async () => {
    state.capCount = 50
    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    await getRegionObjective(PERIOD_ID, 'Honduras', 'Centro I')

    const periodColumns = eqCalls.filter(([, value]) => value === PERIOD_ID).map(([column]) => column)
    expect(periodColumns).toContain(quotaRegionCaps.periodId)
    expect(periodColumns).toContain(quotaTargets.periodId)
    expect(periodColumns).toContain(leads.quotaPeriodId)
  })
})
