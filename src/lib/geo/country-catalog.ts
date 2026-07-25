/**
 * Fuzzy department/municipality validation for the 6 CAM/RD countries other than
 * Guatemala (which has its own curated dataset in guatemala.ts). Derives its
 * department → municipality lists from the same NSE region catalog already used
 * for quota matching (data/geo/cam-nse-regions.json), so there's one source of
 * truth per country instead of a second hand-maintained geo file.
 */
import catalogJson from '../../../data/geo/cam-nse-regions.json'
import { bestRanked, toGeoResult } from './fuzzy-match'
import type { GeoValidationResult } from './fuzzy-match'

type NseCamEntry = { nseRegion: string; stateProvince: string; municipality: string }
type CatalogFile = { version: string; source: string; countries: Record<string, NseCamEntry[]> }
const catalog = catalogJson as CatalogFile

interface Department {
  name: string
  municipalities: string[]
}

/** The catalog's raw entries are ALL CAPS for some countries — title-case for display. */
function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/(\s+)/)
    .map((chunk) => (/^\s+$/.test(chunk) ? chunk : chunk.charAt(0).toUpperCase() + chunk.slice(1)))
    .join('')
}

function buildDepartments(country: string): Department[] {
  const entries = catalog.countries[country] ?? []
  const byDept = new Map<string, Set<string>>()
  for (const e of entries) {
    const deptName = titleCase(e.stateProvince)
    const muniName = titleCase(e.municipality)
    if (!byDept.has(deptName)) byDept.set(deptName, new Set())
    byDept.get(deptName)!.add(muniName)
  }
  return [...byDept.entries()].map(([name, municipalities]) => ({
    name,
    municipalities: [...municipalities].sort(),
  }))
}

const departmentsByCountry = new Map<string, Department[]>()

function departmentsFor(country: string): Department[] {
  let deps = departmentsByCountry.get(country)
  if (!deps) {
    deps = buildDepartments(country)
    departmentsByCountry.set(country, deps)
  }
  return deps
}

/** Countries covered by this generic validator — every catalog country except Guatemala. */
export function isSupportedGeoCountry(country: string): boolean {
  return country !== 'Guatemala' && Object.prototype.hasOwnProperty.call(catalog.countries, country)
}

function findDepartment(country: string, name: string): Department | null {
  const deps = departmentsFor(country)
  const match = bestRanked(name, deps.map((d) => d.name))
  return match ? deps.find((d) => d.name === match.name) ?? null : null
}

export function validateCountryDepartment(country: string, input: string): GeoValidationResult {
  const deps = departmentsFor(country)
  const examples = deps
    .slice(0, 4)
    .map((d) => d.name)
    .join(', ')
  return toGeoResult(
    bestRanked(input, deps.map((d) => d.name)),
    `No reconocí esa provincia/departamento. Ejemplos: ${examples}. ¿Puedes escribirlo de nuevo?`,
  )
}

export function validateCountryMunicipality(
  country: string,
  input: string,
  departmentName: string,
): GeoValidationResult {
  const dept = findDepartment(country, departmentName)
  if (!dept) {
    return {
      ok: false,
      message: 'Primero necesito una provincia/departamento válido. ¿En qué provincia o departamento vives?',
    }
  }
  const examples = dept.municipalities.slice(0, 4).join(', ')
  return toGeoResult(
    bestRanked(input, dept.municipalities),
    `No reconocí ese municipio/cantón en ${dept.name}. Ejemplos: ${examples}. ¿Puedes intentar de nuevo?`,
  )
}

export function validateCountryGeoField(
  country: string,
  field: 'stateProvince' | 'municipality',
  value: string,
  ctx: { stateProvince?: string | null },
): GeoValidationResult {
  if (field === 'stateProvince') return validateCountryDepartment(country, value)
  return validateCountryMunicipality(country, value, ctx.stateProvince ?? '')
}
