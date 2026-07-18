import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory fake for `db` so these are true unit tests (no live Postgres needed).
// Mirrors the minimal chain shape quota-targets.ts actually calls.
const state: {
  rows: Array<{
    id: string
    country: string
    region: string
    nseLevel: string
    targetCount: number
    active: boolean
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }>
} = { rows: [] }

let nextId = 1
let lastUpdateSet: Record<string, unknown> | null = null

vi.mock('@/lib/db/client', () => {
  const selectChain = () => ({
    from: () => ({
      where: () => ({
        // The only pre-insert SELECT createQuotaTarget issues is the duplicate check —
        // returning whatever's currently in `state.rows` lets tests simulate "already exists"
        // by pre-populating it, while staying empty (the default) for the happy path.
        limit: () => Promise.resolve(state.rows),
      }),
    }),
  })

  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (values: {
          country: string
          region: string
          nseLevel: string
          targetCount?: number
          notes?: string | null
        }) => {
          const row = {
            id: `t${nextId++}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            targetCount: 0,
            notes: null,
            ...values,
          }
          return {
            onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
              returning: () => {
                const existing = state.rows.find(
                  (r) => r.country === row.country && r.region === row.region && r.nseLevel === row.nseLevel,
                )
                if (existing) {
                  Object.assign(existing, set)
                  return Promise.resolve([existing])
                }
                state.rows.push(row as (typeof state.rows)[number])
                return Promise.resolve([row])
              },
            }),
            returning: () => {
              state.rows.push(row as (typeof state.rows)[number])
              return Promise.resolve([row])
            },
          }
        },
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          lastUpdateSet = patch
          return {
            where: () => ({
              returning: () => Promise.resolve([{ id: 'existing-id', ...patch }]),
            }),
          }
        },
      }),
    },
  }
})

describe('quota-targets validation (research.md R3)', () => {
  beforeEach(() => {
    state.rows = []
    nextId = 1
  })

  it('rejects a region not in the geo catalog for the given country', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Region Inventada', nseLevel: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects an unrecognized country', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Narnia', region: 'Centro I', nseLevel: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects an invalid nseLevel', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', nseLevel: 'Nivel 9' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('accepts a valid country/region/nseLevel combination', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const row = await createQuotaTarget({
      country: 'Guatemala',
      region: 'Centro I',
      nseLevel: 'Nivel 2',
      targetCount: 50,
    })
    expect(row.country).toBe('Guatemala')
    expect(row.targetCount).toBe(50)
  })

  it('normalizes country aliases (e.g. "Panama" without accent) before validating', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const row = await createQuotaTarget({ country: 'Panama', region: 'Norte', nseLevel: 'Nivel 2' })
    expect(row.country).toBe('Panamá')
  })

  it('rejects a negative targetCount', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', nseLevel: 'Nivel 2', targetCount: -5 }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('creating a duplicate (country, region, nseLevel) conflicts', async () => {
    const { createQuotaTarget, QuotaTargetConflictError } = await import('@/lib/quotas/quota-targets')
    // Simulate "a row already exists" — the duplicate-check SELECT in createQuotaTarget
    // reads from this same in-memory state.
    state.rows.push({
      id: 'existing',
      country: 'Guatemala',
      region: 'Centro I',
      nseLevel: 'Nivel 2',
      targetCount: 50,
      active: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', nseLevel: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetConflictError)
  })
})

describe('updateQuotaTarget bumps updatedAt on every call (FR-010)', () => {
  beforeEach(() => {
    lastUpdateSet = null
  })

  it('includes an updatedAt Date in the patch sent to the database', async () => {
    const { updateQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const before = Date.now()
    await updateQuotaTarget('existing-id', { targetCount: 60 })
    expect(lastUpdateSet).not.toBeNull()
    expect(lastUpdateSet!.updatedAt).toBeInstanceOf(Date)
    expect((lastUpdateSet!.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('bumps updatedAt even when only toggling active, not targetCount', async () => {
    const { updateQuotaTarget } = await import('@/lib/quotas/quota-targets')
    await updateQuotaTarget('existing-id', { active: false })
    expect(lastUpdateSet).toMatchObject({ active: false })
    expect(lastUpdateSet!.updatedAt).toBeInstanceOf(Date)
  })
})
