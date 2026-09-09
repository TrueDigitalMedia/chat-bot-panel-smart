import { describe, it, expect, vi, beforeEach } from 'vitest'

// spec 016 T015 — branch logic of the `?room=` bootstrap param, with a stubbed DB.

const { dbMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/env', () => ({ env: {} }))

import { applyRoomParam } from '@/lib/web/room-bootstrap'

function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }
}

const updateSets: Record<string, unknown>[] = []
function updateChain() {
  return {
    set: (v: Record<string, unknown>) => {
      updateSets.push(v)
      return { where: () => Promise.resolve(undefined) }
    },
  }
}

describe('applyRoomParam', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    updateSets.length = 0
    dbMock.update.mockImplementation(updateChain)
    logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('no room param -> no_room, writes nothing', async () => {
    const r = await applyRoomParam('lead-1', 'sess-1', null, 0)
    expect(r).toEqual({ outcome: 'no_room', country: null })
    expect(dbMock.select).not.toHaveBeenCalled()
    expect(updateSets).toHaveLength(0)
  })

  it('branch 3 applied — brand-new conversation, resolvable + configured room', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: null }]))
    const r = await applyRoomParam('lead-1', 'sess-1', 'ecuador', 0)
    expect(r).toEqual({ outcome: 'applied', country: 'Ecuador' })
    expect(updateSets).toContainEqual({ country: 'Ecuador' })
    expect(updateSets.some((s) => s.acquisitionSource === 'web:room:Ecuador')).toBe(true)
    expect(logSpy).toHaveBeenCalledWith(
      '[web] web_room_entry',
      expect.objectContaining({ outcome: 'applied', slug: 'ecuador', resolved_country: 'Ecuador' }),
    )
  })

  it('branch 3 applied — méxico slug resolves and configures', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: null }]))
    const r = await applyRoomParam('lead-1', 'sess-1', 'mexico', 0)
    expect(r.outcome).toBe('applied')
    expect(r.country).toBe('México')
  })

  it('branch 3 degrade — unknown slug -> degraded, writes nothing', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: null }]))
    const r = await applyRoomParam('lead-1', 'sess-1', 'guatemala', 0)
    expect(r).toEqual({ outcome: 'degraded', country: null })
    expect(updateSets).toHaveLength(0)
    expect(logSpy).toHaveBeenCalledWith(
      '[web] web_room_entry',
      expect.objectContaining({ outcome: 'degraded', slug: 'guatemala' }),
    )
  })

  it('branch 3 degrade — path-traversal slug -> degraded', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: null }]))
    const r = await applyRoomParam('lead-1', 'sess-1', '../x', 0)
    expect(r.outcome).toBe('degraded')
    expect(updateSets).toHaveLength(0)
  })

  it('branch 2 — existing messages -> existing_lead_ignored, writes nothing', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: null }]))
    const r = await applyRoomParam('lead-1', 'sess-1', 'ecuador', 3)
    expect(r).toEqual({ outcome: 'existing_lead_ignored', country: null })
    expect(updateSets).toHaveLength(0)
    expect(logSpy).toHaveBeenCalledWith(
      '[web] web_room_entry',
      expect.objectContaining({ outcome: 'existing_lead_ignored' }),
    )
  })

  it('branch 2 — country already set (idempotency) -> existing_lead_ignored, writes nothing', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: 'Ecuador' }]))
    const r = await applyRoomParam('lead-1', 'sess-1', 'mexico', 0)
    expect(r.outcome).toBe('existing_lead_ignored')
    expect(updateSets).toHaveLength(0)
  })

  it('logs a hashed session id, never the raw one', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ country: null }]))
    await applyRoomParam('lead-1', 'raw-session-value', 'ecuador', 0)
    const call = logSpy.mock.calls.find((c) => c[0] === '[web] web_room_entry')!
    expect((call[1] as { session_id_hash: string }).session_id_hash).not.toContain('raw-session-value')
    expect((call[1] as { session_id_hash: string }).session_id_hash).toMatch(/^[0-9a-f]{12}$/)
  })
})
