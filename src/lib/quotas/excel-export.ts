import * as XLSX from 'xlsx'
import { listQuotaProgress, type QuotaProgress } from './quota-progress'

const NSE_LEVEL_ORDER = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4']

/**
 * Builds an .xlsx workbook shaped like `docs/Kantar Quotas Test.xlsx`'s CAM sheet, so it
 * round-trips through `importQuotaTargetsFromWorkbook` (excel-import.ts).
 */
export async function exportQuotaTargetsToWorkbook(): Promise<Buffer> {
  const items = await listQuotaProgress()

  const groups = new Map<string, { country: string; region: string; byLevel: Map<string, QuotaProgress> }>()
  for (const item of items) {
    const key = `${item.country}|${item.region}`
    let group = groups.get(key)
    if (!group) {
      group = { country: item.country, region: item.region, byLevel: new Map() }
      groups.set(key, group)
    }
    group.byLevel.set(item.nseLevel, item)
  }

  const rows: unknown[][] = [
    [' ', 'Nivel 1', '', '', 'Nivel 2', '', '', 'Nivel 3', '', '', 'Nivel 4', '', ''],
    [
      '',
      'Objetivo',
      'Conseguidos',
      'Disponibles',
      'Objetivo',
      'Conseguidos',
      'Disponibles',
      'Objetivo',
      'Conseguidos',
      'Disponibles',
      'Objetivo',
      'Conseguidos',
      'Disponibles',
    ],
  ]

  const sortedGroups = [...groups.values()].sort(
    (a, b) => a.country.localeCompare(b.country) || a.region.localeCompare(b.region),
  )

  for (const group of sortedGroups) {
    const row: unknown[] = [`${group.country} - ${group.region}`]
    for (const level of NSE_LEVEL_ORDER) {
      const item = group.byLevel.get(level)
      row.push(item?.target ?? 0, item?.achieved ?? 0, item?.available ?? 0)
    }
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'CAM')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
