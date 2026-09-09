/**
 * Build/verification check for data/geo/mexico-nse-regions.json (spec 015 T003).
 *
 * Asserts:
 *  1. No duplicate `estado|municipio` key — a duplicate would make lookupMexicoNseRegion's
 *     catalog map non-deterministic.
 *  2. Every row's `region` is non-empty (a blank region silently fails every lookup for
 *     that estado/municipio).
 *
 * Usage: npx tsx scripts/verify-mexico-catalog.ts
 * Exits non-zero (and prints every violation) on failure — safe to wire into CI.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

interface MexicoNseRegionRow {
  region: string
  regionCode: string | null
  estrato: string | null
  estado: string
  municipio: string
}

interface MexicoNseRegionsFile {
  version: string
  source: string
  regions: MexicoNseRegionRow[]
}

function main(): void {
  const path = join(process.cwd(), 'data/geo/mexico-nse-regions.json')
  const file = JSON.parse(readFileSync(path, 'utf-8')) as MexicoNseRegionsFile

  const errors: string[] = []
  const seenKeys = new Map<string, number>()

  file.regions.forEach((row, i) => {
    if (!row.region || row.region.trim() === '') {
      errors.push(`Row ${i}: empty region for ${row.estado} / ${row.municipio}`)
    }
    const key = `${row.estado}|${row.municipio}`
    const firstSeenAt = seenKeys.get(key)
    if (firstSeenAt !== undefined) {
      errors.push(`Row ${i}: duplicate estado|municipio key "${key}" (first seen at row ${firstSeenAt})`)
    } else {
      seenKeys.set(key, i)
    }
  })

  if (errors.length > 0) {
    console.error(`❌ mexico-nse-regions.json failed validation (${errors.length} issue(s)):\n`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  const regions = [...new Set(file.regions.map((r) => r.region))].sort()
  console.log(
    `✅ data/geo/mexico-nse-regions.json OK — ${file.regions.length} rows, ` +
      `${regions.length} Kantar regions (${regions.join(', ')}), no duplicate keys.`,
  )
}

main()
