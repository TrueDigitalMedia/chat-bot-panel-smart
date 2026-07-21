import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spy on eq/gte/lte (still delegating to the real implementations so `and()` gets valid
// SQL fragments) to verify countAchieved() only adds channel/date conditions when the
// corresponding filter is actually provided — the core behavior T011 added.
const eqCalls: unknown[][] = []
const gteCalls: unknown[][] = []
const lteCalls: unknown[][] = []

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  return {
    ...actual,
    eq: (...args: [unknown, unknown]) => {
      eqCalls.push(args)
      return actual.eq(...(args as Parameters<typeof actual.eq>))
    },
    gte: (...args: [unknown, unknown]) => {
      gteCalls.push(args)
      return actual.gte(...(args as Parameters<typeof actual.gte>))
    },
    lte: (...args: [unknown, unknown]) => {
      lteCalls.push(args)
      return actual.lte(...(args as Parameters<typeof actual.lte>))
    },
  }
})

let targetRows: Array<{
  id: string
  country: string
  region: string
  dimensionType: string
  dimensionValue: string
  targetCount: number
  active: boolean
  notes: string | null
  updatedAt: Date
}> = []
let fakeAchievedCount = 0

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(targetRows),
        innerJoin: () => ({
          where: () => Promise.resolve([{ count: fakeAchievedCount }]),
        }),
      }),
    }),
  },
}))

import { listQuotaProgress } from '@/lib/quotas/quota-progress'

describe('listQuotaProgress — channel/date-range filters (T011, additive to spec 005)', () => {
  beforeEach(() => {
    eqCalls.length = 0
    gteCalls.length = 0
    lteCalls.length = 0
    fakeAchievedCount = 7
    targetRows = [
      {
        id: 't1',
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
        targetCount: 50,
        active: true,
        notes: null,
        updatedAt: new Date(),
      },
    ]
  })

  it('adds an eq(channel, ...) condition only when a channel filter is provided', async () => {
    await listQuotaProgress({ channel: 'whatsapp' })
    expect(eqCalls.some(([, value]) => value === 'whatsapp')).toBe(true)
  })

  it('adds gte/lte(createdAt, ...) conditions only when a date-range filter is provided', async () => {
    const from = new Date('2026-07-01')
    const to = new Date('2026-07-18')
    await listQuotaProgress({ dateFrom: from, dateTo: to })
    expect(gteCalls.some(([, value]) => value === from)).toBe(true)
    expect(lteCalls.some(([, value]) => value === to)).toBe(true)
  })

  it('combines channel and date-range filters in the same call', async () => {
    const from = new Date('2026-07-01')
    await listQuotaProgress({ channel: 'telegram', dateFrom: from })
    expect(eqCalls.some(([, value]) => value === 'telegram')).toBe(true)
    expect(gteCalls.some(([, value]) => value === from)).toBe(true)
  })

  it('regression guard: a call shaped like spec 005 (no channel/date) adds no gte/lte and no channel eq', async () => {
    await listQuotaProgress({ country: 'Guatemala' })
    expect(gteCalls).toHaveLength(0)
    expect(lteCalls).toHaveLength(0)
    expect(eqCalls.some(([, value]) => value === 'whatsapp' || value === 'telegram' || value === 'web')).toBe(
      false,
    )
  })

  it('still returns correct QuotaProgress data alongside the new filters', async () => {
    const result = await listQuotaProgress({ channel: 'whatsapp' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ country: 'Guatemala', target: 50, achieved: 7, available: 43 })
  })
})
