import catalogJson from '../../../data/geo/mexico-nse-regions.json'
import { normalizeGeoKey } from './cam-nse-catalog'

interface MexicoRegionEntry {
  region: string
  regionCode: string | null
  estrato: string | null
  estado: string
  municipio: string
}

interface MexicoCatalogFile {
  version: string
  source: string
  regions: MexicoRegionEntry[]
}

const catalog = catalogJson as MexicoCatalogFile

let byKey: Map<string, MexicoRegionEntry> | null = null

function getIndex(): Map<string, MexicoRegionEntry> {
  if (byKey) return byKey
  const map = new Map<string, MexicoRegionEntry>()
  for (const e of catalog.regions) {
    const key = `${normalizeGeoKey(e.estado)}|${normalizeGeoKey(e.municipio)}`
    if (!map.has(key)) map.set(key, e)
  }
  byKey = map
  return map
}

/**
 * Resolve a Mexico Estado + Municipio/Alcaldía to its Kantar region. Municipio names
 * collide across estados ("Centro" in Tabasco vs. others), so the match is always on the
 * `estado|municipio` pair — never municipio alone. Returns null (out of geographic quota)
 * on no match. `estrato` / `regionCode` are metadata for logging/sync; the quota decision
 * keys on `region` only (research R3).
 */
export function lookupMexicoNseRegion(
  stateProvince: string | null,
  municipality: string | null,
): string | null {
  if (!stateProvince || !municipality) return null
  const hit = getIndex().get(`${normalizeGeoKey(stateProvince)}|${normalizeGeoKey(municipality)}`)
  return hit?.region ?? null
}

/** Full matched catalog row (region + estrato + regionCode), for the geo_resolve log / sync metadata. */
export function lookupMexicoNseRegionEntry(
  stateProvince: string | null,
  municipality: string | null,
): MexicoRegionEntry | null {
  if (!stateProvince || !municipality) return null
  return getIndex().get(`${normalizeGeoKey(stateProvince)}|${normalizeGeoKey(municipality)}`) ?? null
}

/** The distinct Kantar region names in the catalog — used by scripts/verify-mexico-catalog.ts
 *  and the admin quota tooling (CountryConfig.listNseRegions). */
export const MEXICO_REGIONS: readonly string[] = [
  ...new Set(catalog.regions.map((r) => r.region)),
].sort()
