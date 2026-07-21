import * as XLSX from 'xlsx'
import { upsertQuotaTarget } from './quota-targets'
import { canonicalCountry, canonicalNseRegion } from '@/lib/geo/cam-nse-catalog'

/**
 * Lowercase/trim/collapse-whitespace only — unlike `normalizeGeoKey`, this MUST preserve `+`
 * (distinguishes "50+"/"5+" from "50"/"5") since these header tokens are matched verbatim.
 */
function normalizeHeader(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ')
}

export interface UnmatchedRow {
  row: string
  reason: 'country_not_recognized' | 'region_not_recognized'
}

export interface ImportResult {
  imported: number
  unmatched: UnmatchedRow[]
}

// Header labels from `docs/Muestra Faltante por País Julio 2026_True.xlsx` (one sheet per
// country) mapped to dimension cells. "Embarazadas y bebés..." has no target — it's the
// unconditional exception (spec 011 FR-003), not a configurable quota. Matched by normalized
// text rather than fixed column index so this also round-trips through our own exporter's
// layout (research.md R6, R7).
const HEADER_TO_DIMENSION: Record<string, { dimensionType: 'nse' | 'edad' | 'integrantes'; dimensionValue: string }> = {
  scl1: { dimensionType: 'nse', dimensionValue: 'Nivel 1' },
  scl2: { dimensionType: 'nse', dimensionValue: 'Nivel 2' },
  scl3: { dimensionType: 'nse', dimensionValue: 'Nivel 3' },
  scl4: { dimensionType: 'nse', dimensionValue: 'Nivel 4' },
  'hasta 34': { dimensionType: 'edad', dimensionValue: 'Hasta 34' },
  '35 a 49': { dimensionType: 'edad', dimensionValue: '35 a 49' },
  '50+': { dimensionType: 'edad', dimensionValue: '50+' },
  '1 a 2': { dimensionType: 'integrantes', dimensionValue: '1 a 2' },
  '3 a 4': { dimensionType: 'integrantes', dimensionValue: '3 a 4' },
  '5+': { dimensionType: 'integrantes', dimensionValue: '5+' },
}

/** "Centro I / Honduras" → "Centro I". Region names may themselves contain " / ". */
function stripCountrySuffix(label: string): string {
  const lastSep = label.lastIndexOf(' / ')
  return lastSep === -1 ? label.trim() : label.slice(0, lastSep).trim()
}

function findHeaderRowIndex(rows: unknown[][]): number {
  return rows.findIndex((row) => row.some((cell) => typeof cell === 'string' && normalizeHeader(cell) === 'scl1'))
}

function findLabelCol(row: unknown[]): number {
  return row.findIndex((cell) => typeof cell === 'string' && cell.includes(' / '))
}

/**
 * Parses a `docs/Muestra Faltante por País Julio 2026_True.xlsx`-shaped workbook (one sheet
 * per country) and upserts quota_targets, one row per non-empty dimension cell.
 */
export async function importQuotaTargetsFromWorkbook(buffer: ArrayBuffer | Buffer): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'buffer' })

  let imported = 0
  const unmatched: UnmatchedRow[] = []

  for (const sheetName of wb.SheetNames) {
    const country = canonicalCountry(sheetName)
    if (!country) {
      unmatched.push({ row: sheetName, reason: 'country_not_recognized' })
      continue
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' })
    const headerRowIndex = findHeaderRowIndex(rows)
    if (headerRowIndex === -1) continue // no recognizable header — nothing to import from this sheet

    const headerRow = rows[headerRowIndex]
    const colMap = headerRow
      .map((cell, col) => {
        if (typeof cell !== 'string') return null
        const dim = HEADER_TO_DIMENSION[normalizeHeader(cell)]
        return dim ? { col, ...dim } : null
      })
      .filter((x): x is { col: number; dimensionType: 'nse' | 'edad' | 'integrantes'; dimensionValue: string } => x != null)

    for (const row of rows.slice(headerRowIndex + 1)) {
      const labelCol = findLabelCol(row)
      if (labelCol === -1) continue // header/blank/total row

      const label = row[labelCol] as string
      const regionRaw = stripCountrySuffix(label)
      const region = canonicalNseRegion(country, regionRaw)
      if (!region) {
        unmatched.push({ row: `${sheetName}: ${label}`, reason: 'region_not_recognized' })
        continue
      }

      for (const { col, dimensionType, dimensionValue } of colMap) {
        const cell = row[col]
        if (cell === '' || cell == null) continue
        const targetCount = Number(cell) || 0
        await upsertQuotaTarget({ country, region, dimensionType, dimensionValue, targetCount })
        imported++
      }
    }
  }

  return { imported, unmatched }
}
