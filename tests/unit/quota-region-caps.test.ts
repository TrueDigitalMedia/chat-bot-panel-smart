import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/quotas/quota-progress', () => ({
  QUALIFIED_STATUSES: ['link_sent', 'waiting_for_code'],
  resolvePeriodIds: vi.fn(async () => [PERIOD_ID]),
}))

// Spec 018: todo tope cuelga de un periodo, y region-caps.ts valida vía assertPeriodWritable que
// esté ABIERTO y sea del mismo país.
const PERIOD_ID = 'period-Honduras'
const CLOSED_PERIOD_ID = 'period-cerrado'
const periodId = (country: string) => `period-${country}`

vi.mock('@/lib/quotas/quota-periods', () => ({
  getQuotaPeriod: vi.fn(async (id: string) => {
    if (id === CLOSED_PERIOD_ID) return { id, country: 'Honduras', label: 'Q3 2026', status: 'closed' }
    if (!id.startsWith('period-')) return null
    return { id, country: id.slice('period-'.length), label: 'Q4 2026', status: 'open' }
  }),
}))

const state: {
  caps: Array<{
    id: string
    periodId: string
    country: string
    region: string
    capCount: number | null
    notes: string | null
    createdAt: Date
    updatedAt: Date
  }>
} = { caps: [] }
let fakeAchievedCount = 0
let nextId = 1
let lastUpdateSet: Record<string, unknown> | null = null

// `select().from().where().limit()` covers cap CRUD lookups; `select().from().innerJoin().where()`
// covers `countRegionAchieved`'s leads+surveyProfiles join — both are used by region-caps.ts.
vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => {
      const chain = {
        from: () => ({
          where: (...args: unknown[]) => {
            void args
            return {
              limit: () => Promise.resolve(state.caps),
            }
          },
          innerJoin: () => ({
            where: () => Promise.resolve([{ count: fakeAchievedCount }]),
          }),
        }),
      }
      return chain
    },
    insert: () => ({
      values: (values: {
        periodId: string
        country: string
        region: string
        capCount: number | null
        notes: string | null
      }) => ({
        returning: () => {
          const row = { id: `c${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...values }
          state.caps.push(row)
          return Promise.resolve([row])
        },
      }),
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
}))

describe('region-caps validation', () => {
  beforeEach(() => {
    state.caps = []
    nextId = 1
    fakeAchievedCount = 0
  })

  it('rejects an unrecognized country', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ periodId: periodId('Narnia'), country: 'Narnia', region: 'Centro I' })).rejects.toThrow(QuotaTargetError)
  })

  it('rejects a region not valid for the country', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ periodId: periodId('Honduras'), country: 'Honduras', region: 'Region Inventada' })).rejects.toThrow(QuotaTargetError)
  })

  it('accepts a null capCount ("sin tope")', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const row = await createRegionCap({ periodId: periodId('Honduras'), country: 'Honduras', region: 'Centro I', capCount: null })
    expect(row.capCount).toBeNull()
  })

  it('rejects a negative capCount', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ periodId: periodId('Honduras'), country: 'Honduras', region: 'Centro I', capCount: -1 })).rejects.toThrow(QuotaTargetError)
  })

  it('updateRegionCap bumps updatedAt', async () => {
    const { updateRegionCap } = await import('@/lib/quotas/region-caps')
    // updateRegionCap carga la fila para validar su periodo antes de escribir (spec 018).
    state.caps.push({
      id: 'existing-id',
      periodId: PERIOD_ID,
      country: 'Honduras',
      region: 'Centro I',
      capCount: 10,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await updateRegionCap('existing-id', { capCount: 40 })
    expect(lastUpdateSet).toMatchObject({ capCount: 40 })
    expect(lastUpdateSet!.updatedAt).toBeInstanceOf(Date)
  })

  // Spec 014 US5 (T040): Ecuador region caps must validate against Ecuador's own catalog.
  it('accepts a valid Ecuador region', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const row = await createRegionCap({ periodId: periodId('Ecuador'), country: 'Ecuador', region: 'Cuenca', capCount: 25 })
    expect(row).toMatchObject({ periodId: periodId('Ecuador'), country: 'Ecuador', region: 'Cuenca', capCount: 25 })
  })

  it('rejects a region not valid for Ecuador (a CAM region name)', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ periodId: periodId('Ecuador'), country: 'Ecuador', region: 'Centro I' })).rejects.toThrow(QuotaTargetError)
  })
})

describe('getRegionCapProgress', () => {
  beforeEach(() => {
    state.caps = []
    nextId = 1
    fakeAchievedCount = 0
  })

  it('returns null when no cap row is configured for the region (treated as "no cap")', async () => {
    const { getRegionCapProgress } = await import('@/lib/quotas/region-caps')
    const progress = await getRegionCapProgress(PERIOD_ID, 'Honduras', 'Centro I')
    expect(progress).toBeNull()
  })

  it('returns cap and achieved when a cap row exists', async () => {
    state.caps.push({
      id: 'c1',
      periodId: PERIOD_ID,
      country: 'Honduras',
      region: 'Centro I',
      capCount: 50,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    fakeAchievedCount = 34

    const { getRegionCapProgress } = await import('@/lib/quotas/region-caps')
    const progress = await getRegionCapProgress(PERIOD_ID, 'Honduras', 'Centro I')
    expect(progress).toEqual({ cap: 50, achieved: 34 })
  })
})

describe('region-caps — validación de periodo (spec 018)', () => {
  beforeEach(() => {
    state.caps = []
    nextId = 1
    fakeAchievedCount = 0
    lastUpdateSet = null
  })

  it('rechaza cargar un tope en un periodo CERRADO', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    await expect(
      createRegionCap({ periodId: CLOSED_PERIOD_ID, country: 'Honduras', region: 'Centro I', capCount: 30 }),
    ).rejects.toMatchObject({ code: 'period_closed' })
  })

  it('rechaza un periodo de otro país', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    await expect(
      createRegionCap({ periodId: periodId('Guatemala'), country: 'Honduras', region: 'Centro I', capCount: 30 }),
    ).rejects.toMatchObject({ code: 'country_mismatch' })
  })

  it('rechaza editar un tope que vive en un periodo cerrado', async () => {
    const { updateRegionCap } = await import('@/lib/quotas/region-caps')
    state.caps.push({
      id: 'existing-id',
      periodId: CLOSED_PERIOD_ID,
      country: 'Honduras',
      region: 'Centro I',
      capCount: 10,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(updateRegionCap('existing-id', { capCount: 99 })).rejects.toMatchObject({
      code: 'period_closed',
    })
    expect(lastUpdateSet).toBeNull()
  })
})
