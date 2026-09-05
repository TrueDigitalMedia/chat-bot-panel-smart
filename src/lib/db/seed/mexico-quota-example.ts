import { loadLocalEnv } from './load-local-env'

loadLocalEnv()

/**
 * México quota-config example fixture (spec 015 T029). Seeds an open `quota_targets`
 * cell for every (region × dimension value) combination across the 12 México NSE
 * regions, plus a `quota_region_caps` row per region (capCount: null = "sin tope") — a
 * complete, immediately-usable example config for dev/QA, not real production numbers.
 * Uses `upsertQuotaTarget`/`createRegionCap` (idempotent create-or-skip below) so this
 * is safe to re-run.
 *
 * Usage: npx tsx --env-file=.env src/lib/db/seed/mexico-quota-example.ts
 */
const EXAMPLE_TARGET_COUNT = 10

async function seedMexicoQuotaExample(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Check your .env file.')
    process.exit(1)
  }

  const { MEXICO_REGIONS } = await import('@/lib/geo/mexico-nse-catalog')
  const { getCountryConfig } = await import('@/lib/countries/registry')
  const { upsertQuotaTarget } = await import('@/lib/quotas/quota-targets')
  const { createRegionCap, RegionCapConflictError } = await import('@/lib/quotas/region-caps')
  const { AGE_BANDS, HOUSEHOLD_BANDS } = await import('@/lib/quotas/dimension-catalog')

  const nseLevels = getCountryConfig('México').nseLevels // ['AB','C+','C','D+','D/E']

  let targetsUpserted = 0
  for (const region of MEXICO_REGIONS) {
    for (const dimensionValue of nseLevels) {
      await upsertQuotaTarget({
        country: 'México',
        region,
        dimensionType: 'nse',
        dimensionValue,
        targetCount: EXAMPLE_TARGET_COUNT,
        notes: 'México example quota config (seed/mexico-quota-example.ts)',
      })
      targetsUpserted++
    }
    for (const dimensionValue of AGE_BANDS) {
      await upsertQuotaTarget({
        country: 'México',
        region,
        dimensionType: 'edad',
        dimensionValue,
        targetCount: EXAMPLE_TARGET_COUNT,
        notes: 'México example quota config (seed/mexico-quota-example.ts)',
      })
      targetsUpserted++
    }
    for (const dimensionValue of HOUSEHOLD_BANDS) {
      await upsertQuotaTarget({
        country: 'México',
        region,
        dimensionType: 'integrantes',
        dimensionValue,
        targetCount: EXAMPLE_TARGET_COUNT,
        notes: 'México example quota config (seed/mexico-quota-example.ts)',
      })
      targetsUpserted++
    }
    console.log(`  ✓ ${region}: ${nseLevels.length + AGE_BANDS.length + HOUSEHOLD_BANDS.length} quota targets`)
  }

  let capsCreated = 0
  for (const region of MEXICO_REGIONS) {
    try {
      await createRegionCap({ country: 'México', region, capCount: null, notes: 'No cap — example config' })
      capsCreated++
    } catch (err) {
      if (err instanceof RegionCapConflictError) continue // already seeded — idempotent re-run
      throw err
    }
  }

  console.log(`Done: ${targetsUpserted} quota targets upserted, ${capsCreated} new region caps created (across ${MEXICO_REGIONS.length} regions).`)
}

seedMexicoQuotaExample().catch((err) => {
  console.error(err)
  process.exit(1)
})
