/**
 * Build/verification check for data/geo/ecuador-nse-regions.json (spec 014 T004).
 *
 * Asserts:
 *  1. Every row's `region` is one of the 12 known Ecuador NSE regions (ECUADOR_REGIONS
 *     in src/lib/geo/ecuador-nse-catalog.ts) — a typo'd or new region name in the source
 *     workbook would otherwise silently fail every lookup for that region.
 *  2. No duplicate `provincia|canton|parroquiaUrbana` key — a duplicate would make
 *     lookupEcuadorNseRegion's catalog maps non-deterministic (last-write-wins on
 *     import, masking which row actually "wins").
 *
 * Usage: npx tsx scripts/verify-ecuador-catalog.ts
 * Exits non-zero (and prints every violation) on failure — safe to wire into CI.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ECUADOR_REGIONS } from '@/lib/geo/ecuador-nse-catalog'

interface EcuadorNseRegionRow {
  region: string
  provincia: string
  canton: string
  parroquia: string
  parroquiaUrbana: string
}

interface EcuadorNseRegionsFile {
  version: string
  source: string
  regions: EcuadorNseRegionRow[]
}

function main(): void {
  const path = join(process.cwd(), 'data/geo/ecuador-nse-regions.json')
  const file = JSON.parse(readFileSync(path, 'utf-8')) as EcuadorNseRegionsFile
  const knownRegions = new Set<string>(ECUADOR_REGIONS)

  const errors: string[] = []
  const seenKeys = new Map<string, number>()

  file.regions.forEach((row, i) => {
    if (!knownRegions.has(row.region)) {
      errors.push(
        `Row ${i}: region "${row.region}" is not one of the known 12 regions (${[...knownRegions].join(', ')})`,
      )
    }
    const key = `${row.provincia}|${row.canton}|${row.parroquiaUrbana}`
    const firstSeenAt = seenKeys.get(key)
    if (firstSeenAt !== undefined) {
      errors.push(`Row ${i}: duplicate provincia|canton|parroquiaUrbana key "${key}" (first seen at row ${firstSeenAt})`)
    } else {
      seenKeys.set(key, i)
    }
  })

  if (errors.length > 0) {
    console.error(`❌ ecuador-nse-regions.json failed validation (${errors.length} issue(s)):\n`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(
    `✅ data/geo/ecuador-nse-regions.json OK — ${file.regions.length} rows, ` +
      `${knownRegions.size} known regions, no duplicate keys.`,
  )
}

main()
