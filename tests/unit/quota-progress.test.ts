import { describe, it, expect, vi } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so
// unit tests don't need a real connection string just to import quota-progress.ts.
vi.mock('@/lib/db/client', () => ({ db: {} }))

import { toProgress, type QuotaTargetRow } from '@/lib/quotas/quota-progress'

function baseRow(overrides: Partial<QuotaTargetRow> = {}): QuotaTargetRow {
  return {
    id: 'target-1',
    country: 'Guatemala',
    region: 'Sur Occidente Chico',
    dimensionType: 'nse',
    dimensionValue: 'Nivel 2',
    targetCount: 50,
    active: true,
    notes: null,
    updatedAt: new Date('2026-07-18T00:00:00Z'),
    ...overrides,
  }
}

describe('toProgress — objetivo/conseguidos/disponibles math', () => {
  it('computes available as target minus achieved', () => {
    const progress = toProgress(baseRow({ targetCount: 50 }), 4)
    expect(progress.available).toBe(46)
    expect(progress.progressPct).toBe(8)
  })

  it('clamps available at 0 when achieved exceeds target', () => {
    const progress = toProgress(baseRow({ targetCount: 10 }), 15)
    expect(progress.available).toBe(0)
  })

  it('caps progressPct at 100 even when achieved exceeds target', () => {
    const progress = toProgress(baseRow({ targetCount: 10 }), 15)
    expect(progress.progressPct).toBe(100)
  })

  it('reports 0% progress for a target of 0 without dividing by zero', () => {
    const progress = toProgress(baseRow({ targetCount: 0 }), 0)
    expect(progress.progressPct).toBe(0)
    expect(progress.available).toBe(0)
  })

  it('preserves the active flag as-is (availability decision happens in checkQuotaAvailability)', () => {
    const progress = toProgress(baseRow({ active: false, targetCount: 50 }), 0)
    expect(progress.available).toBe(50)
    expect(progress.active).toBe(false)
  })

  it('carries dimensionType/dimensionValue through unchanged', () => {
    const progress = toProgress(baseRow({ dimensionType: 'edad', dimensionValue: '50+' }), 0)
    expect(progress.dimensionType).toBe('edad')
    expect(progress.dimensionValue).toBe('50+')
  })
})
