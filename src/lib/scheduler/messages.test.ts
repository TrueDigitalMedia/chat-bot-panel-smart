import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/db/client', () => ({ db: dbMock }))

import { getNextMessageVariant, getFallbackMessage, resolveMessagePool } from './messages'

/** Chainable fake matching both `where()` (awaited directly) and `where().orderBy()`. */
function selectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => Object.assign(Promise.resolve(rows), { orderBy: () => Promise.resolve(rows) }),
    }),
  }
}

function insertChain(captured: Record<string, unknown>[]) {
  return { values: (v: Record<string, unknown>) => { captured.push(v); return Promise.resolve(undefined) } }
}

function updateChain(captured: Record<string, unknown>[]) {
  return { set: (v: Record<string, unknown>) => { captured.push(v); return { where: () => Promise.resolve(undefined) } } }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolveMessagePool', () => {
  it('maps link_sent to the phase-2 download-reminder pool', () => {
    expect(resolveMessagePool('link_sent')).toBe('phase2_link_reminder')
  })
  it('maps code_delivered_registered to the Ficha Hogar pool', () => {
    expect(resolveMessagePool('code_delivered_registered')).toBe('phase4_ficha_hogar')
  })
  it('defaults everything else to the phase-1 generic pool', () => {
    expect(resolveMessagePool('incomplete')).toBe('phase1_reengage')
    expect(resolveMessagePool('waiting_for_code')).toBe('phase1_reengage')
  })
})

describe('getFallbackMessage', () => {
  it('returns pool+attempt-specific copy for all three pools', () => {
    expect(getFallbackMessage('phase1_reengage', 1)).toContain('PanelSmart')
    expect(getFallbackMessage('phase2_link_reminder', 1)).toContain('descargaste la app')
    expect(getFallbackMessage('phase4_ficha_hogar', 1)).toContain('Ficha Hogar')
  })
})

describe('getNextMessageVariant', () => {
  it('falls back to the hardcoded pool copy when no variants are seeded', async () => {
    dbMock.select.mockReturnValue(selectChain([]))

    const result = await getNextMessageVariant('lead-1', 1, 'phase4_ficha_hogar')

    expect(result).toEqual({ text: getFallbackMessage('phase4_ficha_hogar', 1), variantOrder: 1 })
    expect(dbMock.insert).not.toHaveBeenCalled()
  })

  it('picks variant 1 on first send, then rotates to variant 2 on the next send for the same pool+attempt', async () => {
    const variants = [
      { pool: 'phase1_reengage', attemptNumber: 1, variantOrder: 1, templateText: 'A' },
      { pool: 'phase1_reengage', attemptNumber: 1, variantOrder: 2, templateText: 'B' },
    ]
    const insertCaptured: Record<string, unknown>[] = []
    dbMock.insert.mockReturnValue(insertChain(insertCaptured))

    // First send: no prior usage row.
    dbMock.select
      .mockReturnValueOnce(selectChain(variants)) // variants lookup
      .mockReturnValueOnce(selectChain([])) // no lastUsage
    const first = await getNextMessageVariant('lead-1', 1, 'phase1_reengage')
    expect(first).toEqual({ text: 'A', variantOrder: 1 })
    expect(insertCaptured[0]).toMatchObject({ leadId: 'lead-1', pool: 'phase1_reengage', attemptNumber: 1, variantOrder: 1 })

    // Second send: lastUsage now shows variantOrder 1 was used → rotates to 2.
    const updateCaptured: Record<string, unknown>[] = []
    dbMock.update.mockReturnValue(updateChain(updateCaptured))
    dbMock.select
      .mockReturnValueOnce(selectChain(variants))
      .mockReturnValueOnce(selectChain([{ leadId: 'lead-1', pool: 'phase1_reengage', attemptNumber: 1, variantOrder: 1 }]))
    const second = await getNextMessageVariant('lead-1', 1, 'phase1_reengage')
    expect(second).toEqual({ text: 'B', variantOrder: 2 })
    expect(updateCaptured[0]).toMatchObject({ variantOrder: 2 })
  })

  it('rotates independently per pool — the same lead/attempt in two pools does not share rotation state', async () => {
    const phase2Variants = [
      { pool: 'phase2_link_reminder', attemptNumber: 1, variantOrder: 1, templateText: 'P2-A' },
      { pool: 'phase2_link_reminder', attemptNumber: 1, variantOrder: 2, templateText: 'P2-B' },
    ]
    const insertCaptured: Record<string, unknown>[] = []
    dbMock.insert.mockReturnValue(insertChain(insertCaptured))

    // Even if this lead already has phase1_reengage attempt-1 usage recorded (from the
    // previous test's rotation), phase2_link_reminder attempt 1 must start fresh — its
    // lastUsage lookup is scoped by pool, so it returns nothing here.
    dbMock.select
      .mockReturnValueOnce(selectChain(phase2Variants)) // phase2 variants lookup
      .mockReturnValueOnce(selectChain([])) // phase2 lastUsage — independent of phase1's usage
    const phase2Message = await getNextMessageVariant('lead-1', 1, 'phase2_link_reminder')

    expect(phase2Message).toEqual({ text: 'P2-A', variantOrder: 1 })
    expect(insertCaptured[0]).toMatchObject({ pool: 'phase2_link_reminder', variantOrder: 1 })
  })
})
