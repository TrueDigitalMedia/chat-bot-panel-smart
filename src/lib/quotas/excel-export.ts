import * as XLSX from 'xlsx'
import { listQuotaProgress, type QuotaProgress } from './quota-progress'

const DIMENSION_COLUMNS: Array<{ dimensionType: string; dimensionValue: string; header: string }> = [
  { dimensionType: 'nse', dimensionValue: 'Nivel 1', header: 'SCL1' },
  { dimensionType: 'nse', dimensionValue: 'Nivel 2', header: 'SCL2' },
  { dimensionType: 'nse', dimensionValue: 'Nivel 3', header: 'SCL3' },
  { dimensionType: 'nse', dimensionValue: 'Nivel 4', header: 'SCL4' },
  { dimensionType: 'edad', dimensionValue: 'Hasta 34', header: 'Hasta 34' },
  { dimensionType: 'edad', dimensionValue: '35 a 49', header: '35 a 49' },
  { dimensionType: 'edad', dimensionValue: '50+', header: '50+' },
  { dimensionType: 'integrantes', dimensionValue: '1 a 2', header: '1 a 2' },
  { dimensionType: 'integrantes', dimensionValue: '3 a 4', header: '3 a 4' },
  { dimensionType: 'integrantes', dimensionValue: '5+', header: '5+' },
]

/**
 * Builds an .xlsx workbook shaped like `docs/Muestra Faltante por País Julio 2026_True.xlsx`
 * (one sheet per country, dimension columns per region), so it round-trips through
 * `importQuotaTargetsFromWorkbook` (excel-import.ts). Exports `target` (not achieved/available)
 * per cell, matching the import format.
 */
export async function exportQuotaTargetsToWorkbook(): Promise<Buffer> {
  const items = await listQuotaProgress()

  const byCountry = new Map<string, Map<string, Map<string, QuotaProgress>>>()
  for (const item of items) {
    let regions = byCountry.get(item.country)
    if (!regions) {
      regions = new Map()
      byCountry.set(item.country, regions)
    }
    let cells = regions.get(item.region)
    if (!cells) {
      cells = new Map()
      regions.set(item.region, cells)
    }
    cells.set(`${item.dimensionType}|${item.dimensionValue}`, item)
  }

  const wb = XLSX.utils.book_new()

  const sortedCountries = [...byCountry.keys()].sort()
  for (const country of sortedCountries) {
    const regions = byCountry.get(country)!
    const rows: unknown[][] = [
      [' ', ...DIMENSION_COLUMNS.map((c) => c.header)],
    ]

    const sortedRegions = [...regions.keys()].sort()
    for (const region of sortedRegions) {
      const cells = regions.get(region)!
      const row: unknown[] = [`${region} / ${country}`]
      for (const { dimensionType, dimensionValue } of DIMENSION_COLUMNS) {
        const item = cells.get(`${dimensionType}|${dimensionValue}`)
        row.push(item?.target ?? '')
      }
      rows.push(row)
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Sheet names are capped at 31 chars and can't contain []/\?*: — country names here are safe.
    XLSX.utils.book_append_sheet(wb, ws, country)
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
