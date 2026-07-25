import { describe, it, expect, vi, beforeEach } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so unit
// tests don't need a real connection string (same approach as tests/unit/quota-progress.test.ts).
let mockCounts: number[] = []
let callIndex = 0

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve([{ count: mockCounts[callIndex++] ?? 0 }]),
        }),
      }),
    }),
  },
}))

import { getConversionFunnel, countQualifiedLeadsTotal } from '@/lib/dashboard/funnel'

describe('getConversionFunnel', () => {
  beforeEach(() => {
    callIndex = 0
  })

  it('computes pctOfPrevious=0 for the first stage and correct counts/pcts for the rest', async () => {
    // started=100, passed_d1=80, passed_d3=60, survey_completed=50, qualified=40, registered=20, ficha=10
    mockCounts = [100, 80, 60, 50, 40, 20, 10]
    const funnel = await getConversionFunnel()

    expect(funnel.stages).toHaveLength(7)
    expect(funnel.stages[0]).toMatchObject({ key: 'started', count: 100, pctOfPrevious: 0, pctOfTotal: 100 })
    expect(funnel.stages[1]).toMatchObject({ key: 'passed_d1', count: 80, pctOfPrevious: 80, pctOfTotal: 80 })
    expect(funnel.stages[6]).toMatchObject({
      key: 'ficha_hogar_completada',
      count: 10,
      pctOfTotal: 10,
    })
  })

  it('identifies the stage with the biggest percentage drop vs. its previous stage', async () => {
    // started=100, passed_d1=90 (10% drop), passed_d3=20 (78% drop — biggest),
    // survey_completed=18, qualified=15, registered=10, ficha=9
    mockCounts = [100, 90, 20, 18, 15, 10, 9]
    const funnel = await getConversionFunnel()
    expect(funnel.biggestDropStageKey).toBe('passed_d3')
  })

  it('breaks ties by keeping the earliest stage encountered', async () => {
    // Equal 50% drop at passed_d1 (100->50) and passed_d3 (50->25); first one wins.
    mockCounts = [100, 50, 25, 25, 25, 25, 25]
    const funnel = await getConversionFunnel()
    expect(funnel.biggestDropStageKey).toBe('passed_d1')
  })

  it('handles a fully empty funnel (0 leads) without dividing by zero', async () => {
    mockCounts = [0, 0, 0, 0, 0, 0, 0]
    const funnel = await getConversionFunnel()
    expect(funnel.stages.every((s) => s.pctOfTotal === 0)).toBe(true)
    expect(funnel.stages[0].pctOfPrevious).toBe(0)
  })
})

describe('countQualifiedLeadsTotal', () => {
  beforeEach(() => {
    callIndex = 0
  })

  // Same QUALIFIED_STATUSES-filtered count the funnel's "qualified" stage uses — this
  // is the dashboard's "Conseguidos" total, which must include every qualifying path
  // (nse/edad/integrantes cells AND the pregnancy/baby exception), not just nse cells.
  it('returns the qualified-status count regardless of which dimension/exception qualified them', async () => {
    mockCounts = [19]
    const total = await countQualifiedLeadsTotal({})
    expect(total).toBe(19)
  })
})
