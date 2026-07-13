/**
 * One-shot: Excel "Muestra Regiones NSE CAM.xlsx" → data/geo/cam-nse-regions.json
 *
 * Usage:
 *   npx tsx scripts/import-cam-nse-excel.ts "/path/to/Muestra Regiones NSE CAM.xlsx"
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as XLSX from 'xlsx'

const SHEET_TO_COUNTRY: Record<string, string> = {
  'Regiones Panama': 'Panamá',
  'Regiones Guatemala': 'Guatemala',
  'Regiones Costa Rica': 'Costa Rica',
  'Regiones El Salvador': 'El Salvador',
  'Regiones Nicaragua': 'Nicaragua',
  'Regiones Honduras': 'Honduras',
  'Regiones RD': 'Rep. Dominicana',
}

type Entry = {
  nseRegion: string
  stateProvince: string
  municipality: string
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

function rowToEntry(row: Record<string, unknown>, country: string): Entry | null {
  const nseRegion = pick(row, ['Región', 'Region', 'REGIÓN', 'REGION'])
  const stateProvince =
    country === 'Rep. Dominicana'
      ? pick(row, ['Provincia_Nombre', 'Provincia', 'Departamento'])
      : pick(row, ['Departamento', 'Provincia', 'Provincia_Nombre'])
  const municipality = pick(row, [
    'Municipio',
    'Canton',
    'Cantón',
    'Municipio, Distrito Municipal y Zona',
  ])
  if (!nseRegion || !stateProvince || !municipality) return null
  return { nseRegion, stateProvince, municipality }
}

function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: npx tsx scripts/import-cam-nse-excel.ts <excel-path>')
    process.exit(1)
  }
  const abs = path.resolve(input)
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs)
    process.exit(1)
  }

  const wb = XLSX.readFile(abs)
  const countries: Record<string, Entry[]> = {}

  for (const sheetName of wb.SheetNames) {
    const country = SHEET_TO_COUNTRY[sheetName]
    if (!country) {
      console.warn('Skipping unknown sheet:', sheetName)
      continue
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
      defval: '',
    })
    const entries: Entry[] = []
    const seen = new Set<string>()
    for (const row of rows) {
      const e = rowToEntry(row, country)
      if (!e) continue
      const key = `${e.stateProvince}||${e.municipality}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(e)
    }
    countries[country] = entries
    console.log(`${country}: ${entries.length} places`)
  }

  const out = {
    version: new Date().toISOString().slice(0, 10),
    source: path.basename(abs),
    countries,
  }

  const outPath = path.resolve(process.cwd(), 'data/geo/cam-nse-regions.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log('Wrote', outPath)
}

main()
