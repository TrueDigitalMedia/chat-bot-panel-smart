import * as XLSX from 'xlsx'
import { upsertQuotaTarget } from './quota-targets'
import { canonicalCountry, canonicalNseRegion } from '@/lib/geo/cam-nse-catalog'

export interface UnmatchedRow {
  row: string
  reason: 'country_not_recognized' | 'region_not_recognized'
}

export interface ImportResult {
  imported: number
  unmatched: UnmatchedRow[]
}

/** Row label, e.g. `"Costa Rica - Area metropolitana II"`. Region names may contain " - ". */
function splitRegionLabel(label: string): { countryRaw: string; regionRaw: string } {
  const sepIndex = label.indexOf(' - ')
  return { countryRaw: label.slice(0, sepIndex).trim(), regionRaw: label.slice(sepIndex + 3).trim() }
}

// Column layout discovered by inspecting docs/Kantar Quotas Test.xlsx directly (research.md R1):
// col 0 = region label, then Objetivo/Conseguidos/Disponibles triplets per NSE level.
const LEVEL_TARGET_COLUMNS: Array<{ nseLevel: string; col: number }> = [
  { nseLevel: 'Nivel 1', col: 1 },
  { nseLevel: 'Nivel 2', col: 4 },
  { nseLevel: 'Nivel 3', col: 7 },
  { nseLevel: 'Nivel 4', col: 10 },
]

/** Parses a `docs/Kantar Quotas Test.xlsx`-shaped workbook (CAM sheet) and upserts quota_targets. */
export async function importQuotaTargetsFromWorkbook(buffer: ArrayBuffer | Buffer): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames.find((name) => name === 'CAM')
  if (!sheetName) {
    throw new Error('Missing "CAM" sheet in workbook')
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' })

  let imported = 0
  const unmatched: UnmatchedRow[] = []

  for (const row of rows) {
    const label = typeof row[0] === 'string' ? row[0] : ''
    if (!label.includes(' - ')) continue // header/blank/total rows

    const { countryRaw, regionRaw } = splitRegionLabel(label)
    const country = canonicalCountry(countryRaw)
    if (!country) {
      unmatched.push({ row: label, reason: 'country_not_recognized' })
      continue
    }

    const region = canonicalNseRegion(country, regionRaw)
    if (!region) {
      unmatched.push({ row: label, reason: 'region_not_recognized' })
      continue
    }

    for (const { nseLevel, col } of LEVEL_TARGET_COLUMNS) {
      const targetCount = Number(row[col]) || 0
      await upsertQuotaTarget({ country, region, nseLevel, targetCount })
      imported++
    }
  }

  return { imported, unmatched }
}
