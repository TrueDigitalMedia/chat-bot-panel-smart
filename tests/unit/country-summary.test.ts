import { describe, it, expect } from 'vitest'
import { groupProgressByCountry } from '@/lib/dashboard/country-summary'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'

function progress(overrides: Partial<QuotaProgress> = {}): QuotaProgress {
  return {
    id: 'x',
    country: 'Guatemala',
    region: 'Centro I',
    nseLevel: 'Nivel 2',
    target: 50,
    achieved: 5,
    available: 45,
    active: true,
    notes: null,
    progressPct: 10,
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('groupProgressByCountry', () => {
  it('sums target/achieved across multiple regions for the same country', () => {
    const result = groupProgressByCountry([
      progress({ country: 'Guatemala', region: 'Centro I', target: 50, achieved: 5 }),
      progress({ country: 'Guatemala', region: 'NorOriente', target: 30, achieved: 15 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ country: 'Guatemala', target: 80, achieved: 20, pct: 25 })
  })

  it('keeps different countries separate', () => {
    const result = groupProgressByCountry([
      progress({ country: 'Guatemala', target: 100, achieved: 10 }),
      progress({ country: 'Costa Rica', target: 50, achieved: 50 }),
    ])
    expect(result).toHaveLength(2)
    const cr = result.find((r) => r.country === 'Costa Rica')
    expect(cr).toMatchObject({ target: 50, achieved: 50, pct: 100 })
  })

  it('reports pct=0 for a country with target=0, without dividing by zero', () => {
    const result = groupProgressByCountry([progress({ country: 'Panamá', target: 0, achieved: 0 })])
    expect(result[0]).toMatchObject({ pct: 0 })
  })

  it('sorts by target descending', () => {
    const result = groupProgressByCountry([
      progress({ country: 'A', target: 10, achieved: 0 }),
      progress({ country: 'B', target: 100, achieved: 0 }),
      progress({ country: 'C', target: 50, achieved: 0 }),
    ])
    expect(result.map((r) => r.country)).toEqual(['B', 'C', 'A'])
  })

  it('returns an empty array for empty input', () => {
    expect(groupProgressByCountry([])).toEqual([])
  })
})
