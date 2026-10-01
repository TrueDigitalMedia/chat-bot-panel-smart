import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quotaTargets } from '@/lib/db/schema'

// In-memory fake for `db` so these are true unit tests (no live Postgres needed).
// Mirrors the minimal chain shape quota-targets.ts actually calls.
const state: {
  rows: Array<{
    id: string
    periodId: string
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

// The duplicate-check SELECT filters by `and(eq(periodId), eq(region), eq(dimensionType),
// eq(dimensionValue))` — evaluate that for real against `state.rows` (via the real `eq`/`and`
// SQL builders) instead of blindly returning every row, so sequential creates for DIFFERENT
// dimensions in the same test aren't misreported as duplicates.
const COLUMN_FIELD = new Map<unknown, keyof (typeof state.rows)[number]>()
COLUMN_FIELD.set(quotaTargets.id, 'id')
COLUMN_FIELD.set(quotaTargets.periodId, 'periodId')
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

// Spec 018: toda cuota cuelga de un periodo, y quota-targets.ts valida que esté ABIERTO y sea
// del mismo país. Un id por país (`period-<país>`) alcanza para todos los casos felices.
const CLOSED_PERIOD_ID = 'period-cerrado'
const periodId = (country: string) => `period-${country}`

vi.mock('@/lib/quotas/quota-periods', () => ({
  getQuotaPeriod: vi.fn(async (id: string) => {
    if (id === CLOSED_PERIOD_ID) {
      return { id, country: 'Guatemala', label: 'Q3 2026', status: 'closed' }
    }
    if (!id.startsWith('period-')) return null
    return { id, country: id.slice('period-'.length), label: 'Q4 2026', status: 'open' }
  }),
}))

// listQuotaTargets resuelve el alcance por acá; estos tests solo ejercitan create/update/upsert.
vi.mock('@/lib/quotas/quota-progress', () => ({ resolvePeriodIds: vi.fn(async () => []) }))

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
          periodId: string
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
                    r.periodId === row.periodId &&
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
      createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Region Inventada', dimensionType: 'nse', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects an unrecognized country', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ periodId: periodId('Narnia'), country: 'Narnia', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects an invalid dimensionType', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Centro I', dimensionType: 'peso', dimensionValue: 'x' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects a dimensionValue not valid for the given dimensionType', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 9' }),
    ).rejects.toThrow(QuotaTargetError)
    await expect(
      createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Centro I', dimensionType: 'edad', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('accepts a valid country/region/dimensionType/dimensionValue combination for each dimension', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const nse = await createQuotaTarget({
      periodId: periodId('Guatemala'),
      country: 'Guatemala',
      region: 'Centro I',
      dimensionType: 'nse',
      dimensionValue: 'Nivel 2',
      targetCount: 50,
    })
    expect(nse).toMatchObject({ country: 'Guatemala', dimensionType: 'nse', dimensionValue: 'Nivel 2', targetCount: 50 })

    const edad = await createQuotaTarget({
      periodId: periodId('Guatemala'),
      country: 'Guatemala',
      region: 'Centro I',
      dimensionType: 'edad',
      dimensionValue: '50+',
      targetCount: 20,
    })
    expect(edad).toMatchObject({ dimensionType: 'edad', dimensionValue: '50+' })

    const integrantes = await createQuotaTarget({
      periodId: periodId('Guatemala'),
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
    const row = await createQuotaTarget({ periodId: periodId('Panamá'), country: 'Panama', region: 'Norte', dimensionType: 'nse', dimensionValue: 'Nivel 2' })
    expect(row.country).toBe('Panamá')
  })

  it('rejects a negative targetCount', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({
        periodId: periodId('Guatemala'),
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
      periodId: periodId('Guatemala'),
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
      createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 2' }),
    ).rejects.toThrow(QuotaTargetConflictError)
  })

  it('the same region+value does NOT conflict across different dimensionTypes', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    // 'Nivel 2' as an nse value vs. some other dimensionType — different key, no conflict.
    await createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 2' })
    await expect(
      createQuotaTarget({ periodId: periodId('Guatemala'), country: 'Guatemala', region: 'Centro I', dimensionType: 'edad', dimensionValue: 'Hasta 34' }),
    ).resolves.toMatchObject({ dimensionType: 'edad' })
  })
})

// Spec 014 US5 (T040/T041): Ecuador quota targets must validate against Ecuador's own
// catalog/nseLevels (via getCountryConfig), not the CAM-only catalog these were
// previously hardcoded against.
describe('quota-targets validation — Ecuador (spec 014 US5)', () => {
  beforeEach(() => {
    state.rows = []
    nextId = 1
  })

  it('accepts a valid Ecuador region + NSE level (A/B/C/D/E, not CAM Nivel 1-4)', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const row = await createQuotaTarget({
      periodId: periodId('Ecuador'),
      country: 'Ecuador',
      region: 'Guayaquil Norte',
      dimensionType: 'nse',
      dimensionValue: 'B',
      targetCount: 30,
    })
    expect(row).toMatchObject({ periodId: periodId('Ecuador'), country: 'Ecuador', region: 'Guayaquil Norte', dimensionValue: 'B' })
  })

  it('rejects a CAM-style dimensionValue ("Nivel 1") for Ecuador', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ periodId: periodId('Ecuador'), country: 'Ecuador', region: 'Guayaquil Norte', dimensionType: 'nse', dimensionValue: 'Nivel 1' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('rejects a region not in the Ecuador catalog', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({ periodId: periodId('Ecuador'), country: 'Ecuador', region: 'Región Inventada', dimensionType: 'nse', dimensionValue: 'B' }),
    ).rejects.toThrow(QuotaTargetError)
  })

  it('accepts Ecuador on the shared edad/integrantes dimensions (FR-012 — same bands as every country)', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const row = await createQuotaTarget({
      periodId: periodId('Ecuador'),
      country: 'Ecuador',
      region: 'Cuenca',
      dimensionType: 'edad',
      dimensionValue: '50+',
      targetCount: 10,
    })
    expect(row).toMatchObject({ dimensionType: 'edad', dimensionValue: '50+' })
  })

  it('normalizes "ecuador"/"EC" to the canonical "Ecuador" before validating', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    const row = await createQuotaTarget({ periodId: periodId('Ecuador'), country: 'ec', region: 'Cuenca', dimensionType: 'nse', dimensionValue: 'C' })
    expect(row.country).toBe('Ecuador')
  })
})

function seedRow(overrides: Partial<(typeof state.rows)[number]> = {}) {
  const row = {
    id: 'existing-id',
    periodId: periodId('Guatemala'),
    country: 'Guatemala',
    region: 'Centro I',
    dimensionType: 'nse',
    dimensionValue: 'Nivel 2',
    targetCount: 50,
    active: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  state.rows.push(row)
  return row
}

describe('updateQuotaTarget bumps updatedAt on every call (spec 005 FR-010)', () => {
  beforeEach(() => {
    lastUpdateSet = null
    state.rows = []
    // updateQuotaTarget carga la fila para validar su periodo antes de escribir (spec 018).
    seedRow()
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

// Spec 018 — ninguna escritura de configuración puede entrar en un periodo cerrado, ni cruzar
// países: si no, el panel reescribiría en silencio los objetivos de un trimestre ya congelado y el
// corte dejaría de cuadrar con lo que realmente se corrió.
describe('quota-targets — validación de periodo (spec 018)', () => {
  beforeEach(() => {
    state.rows = []
    nextId = 1
    lastUpdateSet = null
  })

  it('rechaza crear en un periodo inexistente con invalid_period', async () => {
    const { createQuotaTarget, QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({
        periodId: 'no-existe',
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
      }),
    ).rejects.toMatchObject({ code: 'invalid_period' })
    await expect(
      createQuotaTarget({
        periodId: '',
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
      }),
    ).rejects.toBeInstanceOf(QuotaTargetError)
  })

  it('rechaza crear en un periodo CERRADO con period_closed', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({
        periodId: CLOSED_PERIOD_ID,
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
      }),
    ).rejects.toMatchObject({ code: 'period_closed' })
  })

  it('rechaza un periodo de otro país con country_mismatch', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    await expect(
      createQuotaTarget({
        periodId: periodId('Honduras'),
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
      }),
    ).rejects.toMatchObject({ code: 'country_mismatch' })
  })

  it('rechaza el upsert del importador de Excel contra un periodo cerrado', async () => {
    const { upsertQuotaTarget } = await import('@/lib/quotas/quota-targets')
    await expect(
      upsertQuotaTarget({
        periodId: CLOSED_PERIOD_ID,
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
        targetCount: 10,
      }),
    ).rejects.toMatchObject({ code: 'period_closed' })
  })

  it('rechaza editar una línea que vive en un periodo cerrado', async () => {
    const { updateQuotaTarget } = await import('@/lib/quotas/quota-targets')
    seedRow({ periodId: CLOSED_PERIOD_ID })
    await expect(updateQuotaTarget('existing-id', { targetCount: 99 })).rejects.toMatchObject({
      code: 'period_closed',
    })
    expect(lastUpdateSet).toBeNull()
  })

  it('la misma celda puede existir en dos periodos distintos sin conflicto', async () => {
    const { createQuotaTarget } = await import('@/lib/quotas/quota-targets')
    seedRow({ id: 'q3', periodId: CLOSED_PERIOD_ID })
    // Misma país/región/dimensión/valor, otro periodo: tiene que poder crearse.
    await expect(
      createQuotaTarget({
        periodId: periodId('Guatemala'),
        country: 'Guatemala',
        region: 'Centro I',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
      }),
    ).resolves.toMatchObject({ periodId: periodId('Guatemala'), dimensionValue: 'Nivel 2' })
  })
})
