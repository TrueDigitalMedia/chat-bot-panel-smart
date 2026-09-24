import { describe, it, expect, vi, beforeEach } from 'vitest'
import { leads, quotaRegionCaps, quotaTargets } from '@/lib/db/schema'

vi.mock('@/lib/quotas/quota-progress', () => ({
  QUALIFIED_STATUSES: ['link_sent', 'waiting_for_code'],
}))

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
    expect(await getRegionObjective('Rep. Dominicana', 'Santiago')).toEqual({
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
    expect(await getRegionObjective('Rep. Dominicana', 'Santiago')).toEqual({
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
    expect(await getRegionObjective('Honduras', 'Centro I')).toEqual({
      objective: 18,
      source: 'nse_sum',
      achieved: 4,
      deactivated: false,
    })
  })

  it('is closed when there are no NSE lines and no cap', async () => {
    const { getRegionObjective } = await import('@/lib/quotas/region-caps')
    expect(await getRegionObjective('Honduras', 'Centro I')).toEqual({
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
    expect(await getRegionObjective('Honduras', 'Centro I')).toEqual({
      objective: 20,
      source: 'cap',
      achieved: 3,
      deactivated: false,
    })
  })
})
