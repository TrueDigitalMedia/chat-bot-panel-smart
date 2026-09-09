import catalogJson from '../../../data/geo/ecuador-nse-regions.json'
import { normalizeGeoKey } from './cam-nse-catalog'

interface EcuadorRegionEntry {
  region: string
  provincia: string
  canton: string
  parroquia: string
  parroquiaUrbana: string
}

interface EcuadorCatalogFile {
  version: string
  source: string
  regions: EcuadorRegionEntry[]
}

const catalog = catalogJson as EcuadorCatalogFile

/** Cantones whose Región depends on Parroquia Urbana, not Parroquia (research R3/R8). */
const URBAN_SPLIT_CANTONES = new Set(['guayaquil', 'distrito metropolitano de quito'])

interface Indexes {
  byUrbanKey: Map<string, string> // provincia|canton|parroquiaUrbana -> region
  byParroquiaKey: Map<string, string> // provincia|canton|parroquia -> region
  byCantonKey: Map<string, string> // provincia|canton -> region, only when unambiguous
}

let indexes: Indexes | null = null

function buildIndexes(): Indexes {
  const byUrbanKey = new Map<string, string>()
  const byParroquiaKey = new Map<string, string>()
  const cantonRegions = new Map<string, Set<string>>()

  for (const e of catalog.regions) {
    const provincia = normalizeGeoKey(e.provincia)
    const canton = normalizeGeoKey(e.canton)
    const parroquia = normalizeGeoKey(e.parroquia)
    const parroquiaUrbana = normalizeGeoKey(e.parroquiaUrbana || e.parroquia)

    const urbanKey = `${provincia}|${canton}|${parroquiaUrbana}`
    if (!byUrbanKey.has(urbanKey)) byUrbanKey.set(urbanKey, e.region)

    const parroquiaKey = `${provincia}|${canton}|${parroquia}`
    if (!byParroquiaKey.has(parroquiaKey)) byParroquiaKey.set(parroquiaKey, e.region)

    const cantonKey = `${provincia}|${canton}`
    if (!cantonRegions.has(cantonKey)) cantonRegions.set(cantonKey, new Set())
    cantonRegions.get(cantonKey)!.add(e.region)
  }

  const byCantonKey = new Map<string, string>()
  for (const [key, regions] of cantonRegions) {
    if (regions.size === 1) byCantonKey.set(key, [...regions][0])
  }

  return { byUrbanKey, byParroquiaKey, byCantonKey }
}

function getIndexes(): Indexes {
  if (!indexes) indexes = buildIndexes()
  return indexes
}

/**
 * Resolve an Ecuador Provincia/Cantón/Parroquia to one NSE Región. Guayaquil and Quito
 * (Distrito Metropolitano) are keyed on Parroquia Urbana — they split into multiple
 * regions (Norte/Sur/Periferia) that only the urban parroquia distinguishes. Everywhere
 * else keys on Parroquia, falling back to Provincia+Cantón when that pair maps to a
 * single region. Returns null (out of geographic quota) on no match.
 */
export function lookupEcuadorNseRegion(
  stateProvince: string | null,
  municipality: string | null,
  neighborhood: string | null,
): string | null {
  if (!stateProvince || !municipality) return null
  const { byUrbanKey, byParroquiaKey, byCantonKey } = getIndexes()

  const provincia = normalizeGeoKey(stateProvince)
  const canton = normalizeGeoKey(municipality)
  const isUrbanSplit = URBAN_SPLIT_CANTONES.has(canton)

  if (neighborhood) {
    const parroquia = normalizeGeoKey(neighborhood)
    if (isUrbanSplit) {
      const hit = byUrbanKey.get(`${provincia}|${canton}|${parroquia}`)
      if (hit) return hit
    } else {
      const hit = byParroquiaKey.get(`${provincia}|${canton}|${parroquia}`)
      if (hit) return hit
    }
  }

  if (!isUrbanSplit) {
    const hit = byCantonKey.get(`${provincia}|${canton}`)
    if (hit) return hit
  }

  return null
}

/** The 12 known Ecuador NSE regions — used by scripts/verify-ecuador-catalog.ts. */
export const ECUADOR_REGIONS = [
  'Costa Norte',
  'Costa Sur',
  'Cuenca',
  'Guayaquil Norte',
  'Guayaquil Sur',
  'Manta Porto Viejo',
  'Quito Norte',
  'Quito Sur',
  'Santo Domingo',
  'Sierra',
  'Zona Perfieria/Valles',
  'Zona Periferia GYE',
] as const
