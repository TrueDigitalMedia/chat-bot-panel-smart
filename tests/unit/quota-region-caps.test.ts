import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/quotas/quota-progress', () => ({
  QUALIFIED_STATUSES: ['link_sent', 'waiting_for_code'],
}))

const state: {
  caps: Array<{ id: string; country: string; region: string; capCount: number | null; notes: string | null; createdAt: Date; updatedAt: Date }>
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
      values: (values: { country: string; region: string; capCount: number | null; notes: string | null }) => ({
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
    await expect(createRegionCap({ country: 'Narnia', region: 'Centro I' })).rejects.toThrow(QuotaTargetError)
  })

  it('rejects a region not valid for the country', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ country: 'Honduras', region: 'Region Inventada' })).rejects.toThrow(QuotaTargetError)
  })

  it('accepts a null capCount ("sin tope")', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const row = await createRegionCap({ country: 'Honduras', region: 'Centro I', capCount: null })
    expect(row.capCount).toBeNull()
  })

  it('rejects a negative capCount', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ country: 'Honduras', region: 'Centro I', capCount: -1 })).rejects.toThrow(QuotaTargetError)
  })

  it('updateRegionCap bumps updatedAt', async () => {
    const { updateRegionCap } = await import('@/lib/quotas/region-caps')
    await updateRegionCap('existing-id', { capCount: 40 })
    expect(lastUpdateSet).toMatchObject({ capCount: 40 })
    expect(lastUpdateSet!.updatedAt).toBeInstanceOf(Date)
  })

  // Spec 014 US5 (T040): Ecuador region caps must validate against Ecuador's own catalog.
  it('accepts a valid Ecuador region', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const row = await createRegionCap({ country: 'Ecuador', region: 'Cuenca', capCount: 25 })
    expect(row).toMatchObject({ country: 'Ecuador', region: 'Cuenca', capCount: 25 })
  })

  it('rejects a region not valid for Ecuador (a CAM region name)', async () => {
    const { createRegionCap } = await import('@/lib/quotas/region-caps')
    const { QuotaTargetError } = await import('@/lib/quotas/quota-targets')
    await expect(createRegionCap({ country: 'Ecuador', region: 'Centro I' })).rejects.toThrow(QuotaTargetError)
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
    const progress = await getRegionCapProgress('Honduras', 'Centro I')
    expect(progress).toBeNull()
  })

  it('returns cap and achieved when a cap row exists', async () => {
    state.caps.push({
      id: 'c1',
      country: 'Honduras',
      region: 'Centro I',
      capCount: 50,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    fakeAchievedCount = 34

    const { getRegionCapProgress } = await import('@/lib/quotas/region-caps')
    const progress = await getRegionCapProgress('Honduras', 'Centro I')
    expect(progress).toEqual({ cap: 50, achieved: 34 })
  })
})
