import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string just to import sync.ts's dependency chain.
// The chainable `hang` selector never resolves — simulates the real-world stuck Neon
// query the 45s deadline exists to bound (2026-09 audit: `update leads` stuck 15-57min).
const { logCall, mockState, hangingSelect } = vi.hoisted(() => {
  const hangingSelect = () => ({
    from: () => ({ where: () => ({ limit: () => new Promise<never>(() => {}) }) }),
  })
  return {
    logCall: vi.fn(async () => undefined),
    mockState: { syncEnabled: false, dbSelectImpl: hangingSelect as () => unknown },
    hangingSelect,
  }
})

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => mockState.dbSelectImpl(),
  },
}))

vi.mock('@/lib/env', () => ({ isPanelSmartSyncEnabled: () => mockState.syncEnabled, env: {} }))

vi.mock('@/lib/db/call-log', () => ({ logCall }))

import { syncPendingPanelSmartAnswers } from '@/lib/panel-smart/sync'

describe('syncPendingPanelSmartAnswers — deadline timer cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    logCall.mockClear()
    mockState.syncEnabled = false
    mockState.dbSelectImpl = hangingSelect
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not log a false "deadline exceeded" once the sync already resolved (clearTimeout on settle)', async () => {
    // isPanelSmartSyncEnabled() === false makes computePendingSync short-circuit to
    // {status:'disabled'} without ever touching db — the fastest real path through
    // runPanelSmartSync, so it settles long before the 45s deadline could matter.
    mockState.syncEnabled = false
    const result = await syncPendingPanelSmartAnswers('lead1', 'corr1', { trigger: 'manual' })
    expect(result).toBe(true)

    // Advance well past the 45s deadline — the orphaned timer must NOT fire, since the
    // real work already settled and syncPendingPanelSmartAnswers cleared it in `finally`.
    await vi.advanceTimersByTimeAsync(60_000)

    expect(console.error).not.toHaveBeenCalled()
    expect(logCall).not.toHaveBeenCalled()
  })

  it('still logs "deadline exceeded" and resolves false when the underlying sync hangs past the real deadline', async () => {
    // isPanelSmartSyncEnabled() === true routes into loadLead's db.select(), which the
    // hanging mock above never resolves — mirrors a genuinely stuck Neon query, so the
    // deadline branch is the only one that can ever win this race.
    mockState.syncEnabled = true
    const promise = syncPendingPanelSmartAnswers('lead2', 'corr2', { trigger: 'manual' })

    await vi.advanceTimersByTimeAsync(45_000)
    const result = await promise

    expect(result).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      '[panel-smart-sync] deadline exceeded',
      expect.objectContaining({ leadId: 'lead2', correlationId: 'corr2' }),
    )
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead2', error: 'sync deadline exceeded' }),
    )
  })
})
