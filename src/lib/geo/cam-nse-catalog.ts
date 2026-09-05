import catalogJson from '../../../data/geo/cam-nse-regions.json'

export type GeoSource = 'gps_share' | 'text_exact' | 'text_fuzzy'

export type NseCamEntry = {
  nseRegion: string
  stateProvince: string
  municipality: string
}

type CatalogFile = {
  version: string
  source: string
  countries: Record<string, NseCamEntry[]>
}

const catalog = catalogJson as CatalogFile

/** Strip accents, lowercase, collapse whitespace/punctuation for matching. */
export function normalizeGeoKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Map Nominatim / alternate labels → survey button country names. */
export function canonicalCountry(raw: string): string | null {
  const n = normalizeGeoKey(raw)
  const map: Record<string, string> = {
    panama: 'Panamá',
    guatemala: 'Guatemala',
    'costa rica': 'Costa Rica',
    'el salvador': 'El Salvador',
    nicaragua: 'Nicaragua',
    honduras: 'Honduras',
    'republica dominicana': 'Rep. Dominicana',
    'rep dominicana': 'Rep. Dominicana',
    dominicana: 'Rep. Dominicana',
    'dominican republic': 'Rep. Dominicana',
    rd: 'Rep. Dominicana',
    ecuador: 'Ecuador',
    ec: 'Ecuador',
    mexico: 'México',
    mx: 'México',
    'estados unidos mexicanos': 'México',
  }
  // Exact survey names
  for (const name of Object.keys(catalog.countries)) {
    if (normalizeGeoKey(name) === n) return name
  }
  return map[n] ?? null
}

type IndexEntry = { nseRegion: string; stateProvince: string; municipality: string }

const indexes = new Map<string, Map<string, IndexEntry>>()

function countryIndex(country: string): Map<string, IndexEntry> {
  let idx = indexes.get(country)
  if (idx) return idx
  idx = new Map()
  const entries = catalog.countries[country] ?? []
  for (const e of entries) {
    const key = `${normalizeGeoKey(e.stateProvince)}|${normalizeGeoKey(e.municipality)}`
    if (!idx.has(key)) {
      idx.set(key, e)
    }
  }
  indexes.set(country, idx)
  return idx
}

/**
 * Lookup NSE region for country + department + municipality.
 * Returns null if out of geographic quota (not in catalog).
 */
export function lookupNseRegion(
  country: string,
  stateProvince: string,
  municipality: string,
): string | null {
  const c = canonicalCountry(country) ?? country
  const idx = countryIndex(c)
  const key = `${normalizeGeoKey(stateProvince)}|${normalizeGeoKey(municipality)}`
  return idx.get(key)?.nseRegion ?? null
}

export function listCatalogCountries(): string[] {
  return Object.keys(catalog.countries)
}

/** Unique NSE region names for a country, from the same catalog `lookupNseRegion` reads. */
export function listNseRegionsForCountry(country: string): string[] {
  const c = canonicalCountry(country) ?? country
  const entries = catalog.countries[c] ?? []
  return [...new Set(entries.map((e) => e.nseRegion))]
}

/**
 * Resolve a possibly differently-cased/accented region name to the catalog's exact string
 * for that country (e.g. Excel's "Cibao Sin Santiago" → catalog's "Cibao sin Santiago").
 * Returns null if no region in the catalog normalizes to the same key.
 */
export function canonicalNseRegion(country: string, region: string): string | null {
  const regions = listNseRegionsForCountry(country)
  const n = normalizeGeoKey(region)
  return regions.find((r) => normalizeGeoKey(r) === n) ?? null
}
