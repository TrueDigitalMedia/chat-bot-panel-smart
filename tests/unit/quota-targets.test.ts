import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quotaTargets } from '@/lib/db/schema'

// In-memory fake for `db` so these are true unit tests (no live Postgres needed).
// Mirrors the minimal chain shape quota-targets.ts actually calls.
const state: {
  rows: Array<{
    id: string
    country: string
    region: string
    dimensionType: string
    dimensionValue: string
    targetCount: number
    active: boolean
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }>
} = { rows: [] }

let nextId = 1
let lastUpdateSet: Record<string, unknown> | null = null

// The duplicate-check SELECT filters by `and(eq(country), eq(region), eq(dimensionType),
// eq(dimensionValue))` — evaluate that for real against `state.rows` (via the real `eq`/`and`
// SQL builders) instead of blindly returning every row, so sequential creates for DIFFERENT
// dimensions in the same test aren't misreported as duplicates.
const COLUMN_FIELD = new Map<unknown, keyof (typeof state.rows)[number]>()
COLUMN_FIELD.set(quotaTargets.country, 'country')
COLUMN_FIELD.set(quotaTargets.region, 'region')
COLUMN_FIELD.set(quotaTargets.dimensionType, 'dimensionType')
COLUMN_FIELD.set(quotaTargets.dimensionValue, 'dimensionValue')

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({ __eq: true, column, value }),
    and: (...conds: unknown[]) => ({ __and: true, conds }),
  }
})

function matchesRow(row: (typeof state.rows)[number], condition: unknown): boolean {
  const c = condition as { __eq?: boolean; __and?: boolean; column?: unknown; value?: unknown; conds?: unknown[] }
  if (c.__and) return c.conds!.every((cond) => matchesRow(row, cond))
  if (c.__eq) {
    const field = COLUMN_FIELD.get(c.column)
    return field ? row[field] === c.value : true
  }
  return true
}

vi.mock('@/lib/db/client', () => {
  const selectChain = () => ({
    from: () => ({
      where: (condition: unknown) => ({
        // The only pre-insert SELECT createQuotaTarget issues is the duplicate check —
        // filtering `state.rows` by the real condition lets tests simulate "already exists"
        // precisely (not just "something exists"), while staying empty (the default) for
        // the happy path.
        limit: () => Promise.resolve(state.rows.filter((r) => matchesRow(r, condition))),
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
          dimensionType: string
          dimensionValue: string
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
                  (r) =>
                    r.country === row.country &&
                    r.region === row.region &&
                    r.dimensionType === row.dimensionType &&
                    r.dimensionValue === row.dimensionValue,
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

describe('quota-targets validation (data-model.md dimension catalogs)', () => {
  beforeEach(() => {
    state.rows = []
    nextId = 1
  })

  it('rejects a region not in the geo catalog for the given country', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Region Inventada', dimensionType: 'nse', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects an unrecognized country', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Narnia', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects an invalid dimensionType', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', dimensionType: 'peso', dimensionValue: 'x' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects a dimensionValue not valid for the given dimensionType', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 9' }),
    ).rejects.toThrow(QuotaTargetError)
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', dimensionType: 'edad', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('accepts a valid country/region/dimensionType/dimensionValue combination for each dimension', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const nse = await createQuotaTarget({
      country: 'Guatemala',
      region: 'Centro I',
      dimensionType: 'nse',
      dimensionValue: 'Nivel 2',
      targetCount: 50,
    })
    expect(nse).toMatchObject({ country: 'Guatemala', dimensionType: 'nse', dimensionValue: 'Nivel 2', targetCount: 50 })

    const edad = await createQuotaTarget({
      country: 'Guatemala',
      region: 'Centro I',
      dimensionType: 'edad',
      dimensionValue: '50+',
      targetCount: 20,
    })
    expect(edad).toMatchObject({ dimensionType: 'edad', dimensionValue: '50+' })

    const integrantes = await createQuotaTarget({
      country: 'Guatemala',
      region: 'Centro I',
      dimensionType: 'integrantes',
      dimensionValue: '5+',
      targetCount: 22,
    })
    expect(integrantes).toMatchObject({ dimensionType: 'integrantes', dimensionValue: '5+' })
  })

  it('normalizes country aliases (e.g. "Panama" without accent) before validating', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const row = await createQuotaTarget({ country: 'Panama', region: 'Norte', dimensionType: 'nse', dimensionValue: 'Nivel 2' })
    expect(row.country).toBe('Panamá')
  })

  it('rejects a negative targetCount', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
        targetCount: -5,
      }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('creating a duplicate (country, region, dimensionType, dimensionValue) conflicts', async () => {
    const { createQuotaTarget, QuotaTargetConflictError } = await import('@/lib/quotas/quota-targets')
    // Simulate "a row already exists" — the duplicate-check SELECT in createQuotaTarget
    // reads from this same in-memory state.
    state.rows.push({
      id: 'existing',
      country: 'Guatemala',
      region: 'Centro I',
      dimensionType: 'nse',
      dimensionValue: 'Nivel 2',
      targetCount: 50,
      active: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetConflictError)
  })

  it('the same region+value does NOT conflict across different dimensionTypes', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    // 'Nivel 2' as an nse value vs. some other dimensionType — different key, no conflict.
    await createQuotaTarget({ country: 'Guatemala', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 2' })
    await expect(
      createQuotaTarget({ country: 'Guatemala', region: 'Centro I', dimensionType: 'edad', dimensionValue: 'Hasta 34' }),
    ).resolves.toMatchObject({ dimensionType: 'edad' })
  })
})

describe('updateQuotaTarget bumps updatedAt on every call (spec 005 FR-010)', () => {
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
