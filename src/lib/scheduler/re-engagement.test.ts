import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock, publishJSON, messagesDelete, countOutboundSinceLastInbound } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  publishJSON: vi.fn(),
  messagesDelete: vi.fn(),
  countOutboundSinceLastInbound: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/db/conversation-messages', () => ({ countOutboundSinceLastInbound }))
vi.mock('@/lib/env', () => ({
  env: { QSTASH_TOKEN: 'test-token' },
  appBaseUrl: () => 'https://example.test',
}))
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: (...args: unknown[]) => publishJSON(...args),
    messages: { delete: (...args: unknown[]) => messagesDelete(...args) },
  })),
}))

import {
  scheduleJob,
  cancelPendingJobs,
  cancelPendingRecontact,
  scheduleRecontact,
} from './re-engagement'

/** Chainable fake matching `db.select().from(X).where(Y)` (no `.limit()` in this module's queries). */
function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  }
}

/** Chainable fake matching `db.insert(X).values(Y).onConflictDoUpdate(Z)`, capturing both. */
function insertChain(captured: { values?: Record<string, unknown>; onConflict?: Record<string, unknown> }) {
  return {
    values: (values: Record<string, unknown>) => {
      captured.values = values
      return {
        onConflictDoUpdate: (onConflict: Record<string, unknown>) => {
          captured.onConflict = onConflict
          return Promise.resolve(undefined)
        },
      }
    },
  }
}

/** Chainable fake matching `db.update(X).set(Y).where(Z)`, capturing `set` payloads. */
function updateChain(captured: Record<string, unknown>[]) {
  return {
    set: (values: Record<string, unknown>) => {
      captured.push(values)
      return { where: () => Promise.resolve(undefined) }
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  publishJSON.mockResolvedValue({ messageId: 'qstash-msg-1' })
  countOutboundSinceLastInbound.mockResolvedValue(0)
})

describe('scheduleJob', () => {
  it('upserts on conflict instead of silently dropping a re-armed schedule', async () => {
    const insertCaptured: { values?: Record<string, unknown>; onConflict?: Record<string, unknown> } = {}
    dbMock.insert.mockReturnValue(insertChain(insertCaptured))

    await scheduleJob('lead-1', 1, 1, 4500, 're-engage')

    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.test/api/jobs/re-engage', delay: 4500 }),
    )
    expect(insertCaptured.values).toMatchObject({
      leadId: 'lead-1',
      phase: 1,
      attemptNumber: 1,
      action: 're-engage',
      qstashMessageId: 'qstash-msg-1',
    })
    // The regression this guards: re-arming the same (leadId, phase, attemptNumber) key
    // must overwrite the row (fresh qstashMessageId, cleared deliveredAt/outcome) rather
    // than being silently dropped by onConflictDoNothing — which orphaned the new QStash
    // message (uncancellable, since only the *first* message's id was ever persisted).
    expect(insertCaptured.onConflict).toBeTruthy()
    expect(insertCaptured.onConflict?.set).toMatchObject({
      qstashMessageId: 'qstash-msg-1',
      action: 're-engage',
      deliveredAt: null,
      outcome: null,
    })
  })
})

describe('cancelPendingRecontact', () => {
  it('cancels only re-engage rows for the lead, across phases, leaving functional jobs untouched', async () => {
    // Rows the (and eq leadId, eq action='re-engage') filter is expected to have already
    // narrowed to — cancelPendingRecontact trusts its own where clause, so this fake
    // just returns what a correctly-scoped query would return.
    dbMock.select.mockReturnValue(
      selectChain([
        { id: 'row-1', qstashMessageId: 'msg-a', outcome: null },
        { id: 'row-2', qstashMessageId: 'msg-b', outcome: null },
      ]),
    )
    const updateCaptured: Record<string, unknown>[] = []
    dbMock.update.mockReturnValue(updateChain(updateCaptured))

    await cancelPendingRecontact('lead-1')

    expect(messagesDelete).toHaveBeenCalledTimes(2)
    expect(messagesDelete).toHaveBeenCalledWith('msg-a')
    expect(messagesDelete).toHaveBeenCalledWith('msg-b')
    expect(updateCaptured).toHaveLength(2)
    expect(updateCaptured.every((s) => s.outcome === 'cancelled')).toBe(true)
  })

  it('skips rows that already have an outcome (already fired/cancelled)', async () => {
    dbMock.select.mockReturnValue(selectChain([{ id: 'row-1', qstashMessageId: 'msg-a', outcome: 'no_response' }]))
    const updateCaptured: Record<string, unknown>[] = []
    dbMock.update.mockReturnValue(updateChain(updateCaptured))

    await cancelPendingRecontact('lead-1')

    expect(messagesDelete).not.toHaveBeenCalled()
    expect(updateCaptured).toHaveLength(0)
  })
})

describe('cancelPendingJobs', () => {
  it('cancels every pending row for a (leadId, phase) pair regardless of action', async () => {
    dbMock.select.mockReturnValue(
      selectChain([
        { id: 'row-1', qstashMessageId: 'msg-code', outcome: null },
        { id: 'row-2', qstashMessageId: 'msg-reengage', outcome: null },
      ]),
    )
    const updateCaptured: Record<string, unknown>[] = []
    dbMock.update.mockReturnValue(updateChain(updateCaptured))

    await cancelPendingJobs('lead-1', 2)

    expect(messagesDelete).toHaveBeenCalledTimes(2)
    expect(updateCaptured).toHaveLength(2)
  })
})

describe('scheduleRecontact', () => {
  it('cancels without scheduling when the lead is already in a terminal status', async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([{ leadStatus: 'not_qualified', currentPhase: 1 }])) // scheduleRecontact's own lead lookup
      .mockReturnValueOnce(selectChain([])) // cancelPendingRecontact's row lookup

    await scheduleRecontact('lead-1', 'corr-1')

    expect(dbMock.insert).not.toHaveBeenCalled()
    expect(publishJSON).not.toHaveBeenCalled()
  })

  it('cancels any existing recontact job, then schedules attempt 1 under the freshly-read phase', async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([{ leadStatus: 'link_sent', currentPhase: 2 }])) // fresh lead lookup
      .mockReturnValueOnce(selectChain([{ id: 'stale-row', qstashMessageId: 'stale-msg', outcome: null }])) // cancelPendingRecontact
    const updateCaptured: Record<string, unknown>[] = []
    dbMock.update.mockReturnValue(updateChain(updateCaptured))
    const insertCaptured: { values?: Record<string, unknown> } = {}
    dbMock.insert.mockReturnValue(insertChain(insertCaptured))

    await scheduleRecontact('lead-1', 'corr-1')

    // The stale job gets cancelled first...
    expect(messagesDelete).toHaveBeenCalledWith('stale-msg')
    // ...then a fresh one is scheduled under phase 2 (not whatever phase the caller
    // might have had cached), attempt 1.
    expect(insertCaptured.values).toMatchObject({ leadId: 'lead-1', phase: 2, attemptNumber: 1, action: 're-engage' })
  })

  it('cancels without scheduling when the lead is buried in unanswered outbound (>= ceiling)', async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([{ leadStatus: 'link_sent', currentPhase: 2 }])) // fresh lead lookup
      .mockReturnValueOnce(selectChain([])) // cancelPendingRecontact's row lookup
    countOutboundSinceLastInbound.mockResolvedValue(4) // REENGAGE_OUTBOUND_CEILING

    await scheduleRecontact('lead-1', 'corr-1')

    expect(dbMock.insert).not.toHaveBeenCalled()
    expect(publishJSON).not.toHaveBeenCalled()
  })

  it('still schedules when the outbound streak is below the ceiling', async () => {
    dbMock.select
      .mockReturnValueOnce(selectChain([{ leadStatus: 'link_sent', currentPhase: 2 }]))
      .mockReturnValueOnce(selectChain([]))
    dbMock.update.mockReturnValue(updateChain([]))
    const insertCaptured: { values?: Record<string, unknown> } = {}
    dbMock.insert.mockReturnValue(insertChain(insertCaptured))
    countOutboundSinceLastInbound.mockResolvedValue(3)

    await scheduleRecontact('lead-1', 'corr-1')

    expect(insertCaptured.values).toMatchObject({ leadId: 'lead-1', attemptNumber: 1, action: 're-engage' })
  })

  it('no-ops entirely when the lead no longer exists', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([]))

    await scheduleRecontact('missing-lead', 'corr-1')

    expect(dbMock.insert).not.toHaveBeenCalled()
    expect(publishJSON).not.toHaveBeenCalled()
  })
})
