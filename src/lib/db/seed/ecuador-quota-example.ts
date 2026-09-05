import { loadLocalEnv } from './load-local-env'

loadLocalEnv()

/**
 * Ecuador quota-config example fixture (spec 014 T036). Seeds an open `quota_targets`
 * cell for every (region × dimension value) combination across the 12 Ecuador NSE
 * regions, plus a `quota_region_caps` row per region (capCount: null = "sin tope") — a
 * complete, immediately-usable example config for dev/QA, not real production numbers.
 * Uses `upsertQuotaTarget`/`createRegionCap` (idempotent create-or-skip below) so this
 * is safe to re-run.
 *
 * Usage: npx tsx --env-file=.env src/lib/db/seed/ecuador-quota-example.ts
 */
const EXAMPLE_TARGET_COUNT = 10

async function seedEcuadorQuotaExample(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Check your .env file.')
    process.exit(1)
  }

  const { ECUADOR_REGIONS } = await import('@/lib/geo/ecuador-nse-catalog')
  const { getCountryConfig } = await import('@/lib/countries/registry')
  const { upsertQuotaTarget } = await import('@/lib/quotas/quota-targets')
  const { createRegionCap, RegionCapConflictError } = await import('@/lib/quotas/region-caps')
  const { AGE_BANDS, HOUSEHOLD_BANDS } = await import('@/lib/quotas/dimension-catalog')

  const nseLevels = getCountryConfig('Ecuador').nseLevels // ['AB', 'C', 'D/E']

  let targetsUpserted = 0
  for (const region of ECUADOR_REGIONS) {
    for (const dimensionValue of nseLevels) {
      await upsertQuotaTarget({
        country: 'Ecuador',
        region,
        dimensionType: 'nse',
        dimensionValue,
        targetCount: EXAMPLE_TARGET_COUNT,
        notes: 'Ecuador example quota config (seed/ecuador-quota-example.ts)',
      })
      targetsUpserted++
    }
    for (const dimensionValue of AGE_BANDS) {
      await upsertQuotaTarget({
        country: 'Ecuador',
        region,
        dimensionType: 'edad',
        dimensionValue,
        targetCount: EXAMPLE_TARGET_COUNT,
        notes: 'Ecuador example quota config (seed/ecuador-quota-example.ts)',
      })
      targetsUpserted++
    }
    for (const dimensionValue of HOUSEHOLD_BANDS) {
      await upsertQuotaTarget({
        country: 'Ecuador',
        region,
        dimensionType: 'integrantes',
        dimensionValue,
        targetCount: EXAMPLE_TARGET_COUNT,
        notes: 'Ecuador example quota config (seed/ecuador-quota-example.ts)',
      })
      targetsUpserted++
    }
    console.log(`  ✓ ${region}: ${nseLevels.length + AGE_BANDS.length + HOUSEHOLD_BANDS.length} quota targets`)
  }

  let capsCreated = 0
  for (const region of ECUADOR_REGIONS) {
    try {
      await createRegionCap({ country: 'Ecuador', region, capCount: null, notes: 'No cap — example config' })
      capsCreated++
    } catch (err) {
      if (err instanceof RegionCapConflictError) continue // already seeded — idempotent re-run
      throw err
    }
  }

  console.log(`Done: ${targetsUpserted} quota targets upserted, ${capsCreated} new region caps created (across ${ECUADOR_REGIONS.length} regions).`)
}

seedEcuadorQuotaExample().catch((err) => {
  console.error(err)
  process.exit(1)
})
