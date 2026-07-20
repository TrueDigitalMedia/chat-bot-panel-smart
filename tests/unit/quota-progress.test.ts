import { describe, it, expect, vi, beforeEach } from 'vitest'

// `db/client.ts` calls `neon(process.env.POSTGRES_URL!)` at module load — mock it so
// unit tests don't need a real connection string just to import quota-progress.ts.
vi.mock('@/lib/db/client', () => ({ db: {} }))
// scoring/quota.ts now also pulls in tdm-mysql/sync.ts -> tdm-mysql/client.ts -> env.ts
// (spec 010), whose eager validateEnv() would otherwise throw without real credentials.
vi.mock('@/lib/env', () => ({
  env: { CLIENT_MYSQL_SYNC_ENABLED: false },
  isClientMysqlConfigured: () => false,
  isClientMysqlSyncEnabled: () => false,
}))

import { toProgress, type QuotaTargetRow } from '@/lib/quotas/quota-progress'

function baseRow(overrides: Partial<QuotaTargetRow> = {}): QuotaTargetRow {
  return {
    id: 'target-1',
    country: 'Guatemala',
    region: 'Sur Occidente Chico',
    nseLevel: 'Nivel 2',
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
})

vi.mock('@/lib/quotas/quota-progress', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quotas/quota-progress')>(
    '@/lib/quotas/quota-progress',
  )
  return { ...actual, getQuotaProgressForTarget: vi.fn() }
})

describe('checkQuotaAvailability — decision logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when no quota_targets row exists for the combination (spec edge case)', async () => {
    const { getQuotaProgressForTarget } = await import('@/lib/quotas/quota-progress')
    vi.mocked(getQuotaProgressForTarget).mockResolvedValue(null)
    const { checkQuotaAvailability } = await import('@/lib/scoring/quota')

    const result = await checkQuotaAvailability({
      country: 'Guatemala',
      nseRegion: 'Sur Occidente Chico',
      segment: 'Nivel 2',
    })
    expect(result).toBe(false)
  })

  it('returns true when available > 0 and active', async () => {
    const { getQuotaProgressForTarget } = await import('@/lib/quotas/quota-progress')
    vi.mocked(getQuotaProgressForTarget).mockResolvedValue({
      id: 't1',
      country: 'Guatemala',
      region: 'Sur Occidente Chico',
      nseLevel: 'Nivel 2',
      target: 50,
      achieved: 4,
      available: 46,
      active: true,
      notes: null,
      progressPct: 8,
      updatedAt: new Date(),
    })
    const { checkQuotaAvailability } = await import('@/lib/scoring/quota')

    const result = await checkQuotaAvailability({
      country: 'Guatemala',
      nseRegion: 'Sur Occidente Chico',
      segment: 'Nivel 2',
    })
    expect(result).toBe(true)
  })

  it('returns false when active is false, even with available > 0 (US4 — deactivated region excluded)', async () => {
    const { getQuotaProgressForTarget } = await import('@/lib/quotas/quota-progress')
    vi.mocked(getQuotaProgressForTarget).mockResolvedValue({
      id: 't1',
      country: 'Guatemala',
      region: 'Sur Occidente Chico',
      nseLevel: 'Nivel 2',
      target: 50,
      achieved: 4,
      available: 46,
      active: false,
      notes: null,
      progressPct: 8,
      updatedAt: new Date(),
    })
    const { checkQuotaAvailability } = await import('@/lib/scoring/quota')

    const result = await checkQuotaAvailability({
      country: 'Guatemala',
      nseRegion: 'Sur Occidente Chico',
      segment: 'Nivel 2',
    })
    expect(result).toBe(false)
  })

  it('returns false when available is exactly 0', async () => {
    const { getQuotaProgressForTarget } = await import('@/lib/quotas/quota-progress')
    vi.mocked(getQuotaProgressForTarget).mockResolvedValue({
      id: 't1',
      country: 'Guatemala',
      region: 'Sur Occidente Chico',
      nseLevel: 'Nivel 2',
      target: 50,
      achieved: 50,
      available: 0,
      active: true,
      notes: null,
      progressPct: 100,
      updatedAt: new Date(),
    })
    const { checkQuotaAvailability } = await import('@/lib/scoring/quota')

    const result = await checkQuotaAvailability({
      country: 'Guatemala',
      nseRegion: 'Sur Occidente Chico',
      segment: 'Nivel 2',
    })
    expect(result).toBe(false)
  })
})
