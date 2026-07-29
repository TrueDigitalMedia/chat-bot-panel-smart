import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock, isPanelSmartSyncEnabled, syncToPanelSmart } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn() },
  isPanelSmartSyncEnabled: vi.fn(),
  syncToPanelSmart: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/db/call-log', () => ({ logCall: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/env', () => ({ isPanelSmartSyncEnabled: () => isPanelSmartSyncEnabled() }))
vi.mock('./client', () => ({ syncToPanelSmart: (...args: unknown[]) => syncToPanelSmart(...args) }))

import { syncPendingPanelSmartAnswers } from './sync'
import { logCall } from '@/lib/db/call-log'

/** Chainable fake matching `db.select().from(X).where(Y).limit(Z)` → resolves to `rows`. */
function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  }
}

/** Chainable fake matching `db.update(X).set(Y).where(Z)` → resolves to `undefined`, capturing `set`. */
function updateChain(captured: Record<string, unknown>[]) {
  return {
    set: (values: Record<string, unknown>) => {
      captured.push(values)
      return { where: () => Promise.resolve(undefined) }
    },
  }
}

const LEAD_ROW = {
  id: 'lead-1',
  panelSmartSyncStatus: null,
  panelSmartLastSyncAt: null,
  panelSmartSyncedAnswersJson: null,
}

const PROFILE_ROW = {
  id: 'profile-1',
  leadId: 'lead-1',
  fullName: 'Ana López',
  cars: '2 o más',
  shoppingCategories: null,
  email: null,
}

describe('syncPendingPanelSmartAnswers', () => {
  let updateSets: Record<string, unknown>[]

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(logCall).mockResolvedValue(undefined)
    updateSets = []
    dbMock.update.mockImplementation(() => updateChain(updateSets))
  })

  it('no-ops and returns true immediately when disabled, without touching the db', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(false)

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1')

    expect(result).toBe(true)
    expect(dbMock.select).not.toHaveBeenCalled()
    expect(syncToPanelSmart).not.toHaveBeenCalled()
  })

  it('no-ops when every filled field already matches the last-synced snapshot', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' } }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1')

    expect(result).toBe(true)
    expect(syncToPanelSmart).not.toHaveBeenCalled()
  })

  it('sends only new/changed fields, then merges them into the snapshot on success', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...LEAD_ROW, panelSmartSyncedAnswersJson: { fullName: 'Ana López' } }]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    syncToPanelSmart.mockResolvedValue(undefined)

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1')

    expect(result).toBe(true)
    expect(syncToPanelSmart).toHaveBeenCalledWith({
      lead_id: 'lead-1',
      responses: [{ codigo_pregunta: 'cars', pregunta: expect.any(String), respuesta: '2 o más' }],
    })
    expect(updateSets[0]).toMatchObject({
      panelSmartSyncStatus: 'synced',
      panelSmartSyncedAnswersJson: { fullName: 'Ana López', cars: '2 o más' },
    })
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', callType: 'panel_smart_sync', correlationId: 'corr-1' }),
    )
  })

  it('leaves the snapshot untouched and marks failed when the outbound call throws', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select
      .mockReturnValueOnce(selectChain([LEAD_ROW]))
      .mockReturnValueOnce(selectChain([PROFILE_ROW]))
      .mockReturnValueOnce(selectChain([]))
    syncToPanelSmart.mockRejectedValue(new Error('Panel Smart sync failed: 500 boom'))

    const result = await syncPendingPanelSmartAnswers('lead-1', 'corr-1')

    expect(result).toBe(false)
    expect(updateSets[0]).toMatchObject({ panelSmartSyncStatus: 'failed' })
    expect(updateSets[0].panelSmartSyncedAnswersJson).toBeUndefined()
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Panel Smart sync failed') }),
    )
  })

  it('returns false without throwing when the lead is not found', async () => {
    isPanelSmartSyncEnabled.mockReturnValue(true)
    dbMock.select.mockReturnValueOnce(selectChain([]))

    const result = await syncPendingPanelSmartAnswers('missing-lead', 'corr-1')

    expect(result).toBe(false)
    expect(syncToPanelSmart).not.toHaveBeenCalled()
  })
})
