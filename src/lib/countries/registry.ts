/**
 * Country-configuration registry — constitution v1.2.0 Principle V: this file is the
 * ONLY place a country name is switched on. Every other conversation/scoring/geo module
 * calls through the returned CountryConfig instead of branching on the country string.
 */
import { makeCamConfig } from './cam'
import { ecuadorConfig } from './ecuador'
import { mexicoConfig } from './mexico'
import { normalizeGeoKey } from '@/lib/geo/cam-nse-catalog'
import type { CountryConfig } from './types'

const CAM_COUNTRY_NAMES = [
  'Guatemala',
  'Honduras',
  'El Salvador',
  'Nicaragua',
  'Costa Rica',
  'Rep. Dominicana',
  'Panamá',
] as const

const camConfigs = new Map<string, CountryConfig>(
  CAM_COUNTRY_NAMES.map((name) => [name, makeCamConfig(name)]),
)

/** Fallback CAM config for an unrecognized/null country (back-compat default). */
const defaultCamConfig = makeCamConfig('Guatemala')

/**
 * Principle V: do not add country branches outside this file. Every consumer that needs
 * country-specific behavior (survey content, NSE scoring, geo resolution, phone
 * validation, screening) MUST go through the CountryConfig this returns.
 */
export function getCountryConfig(country: string | null | undefined): CountryConfig {
  if (!country) return defaultCamConfig
  if (country === 'Ecuador') return ecuadorConfig
  if (country === 'México') return mexicoConfig
  return camConfigs.get(country) ?? defaultCamConfig
}

/** True when `country` resolves to a real (non-fallback) CountryConfig. */
export function isSupportedCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return country === 'Ecuador' || country === 'México' || camConfigs.has(country)
}

/**
 * Every country name with a real CountryConfig — for admin tooling that needs to
 * enumerate all supported countries (spec 014 US5: quota/leads-dashboard country
 * dropdowns) without itself branching on country names (Principle V).
 */
export function listSupportedCountries(): string[] {
  return [...CAM_COUNTRY_NAMES, 'Ecuador', 'México']
}

/** Every valid `nse_region` for `country`, via that country's own CountryConfig. */
export function listNseRegionsForSupportedCountry(country: string): readonly string[] {
  return getCountryConfig(country).listNseRegions()
}

/**
 * Canonicalize a possibly differently-cased/accented region name to its exact catalog
 * string for `country`, using that country's own CountryConfig.listNseRegions() — the
 * admin-tooling analogue of cam-nse-catalog.ts's canonicalNseRegion, but country-agnostic
 * (works for Ecuador too). Returns null if no region for that country normalizes to the
 * same key.
 */
export function canonicalNseRegionForSupportedCountry(country: string, region: string): string | null {
  const regions = listNseRegionsForSupportedCountry(country)
  const n = normalizeGeoKey(region)
  return regions.find((r) => normalizeGeoKey(r) === n) ?? null
}
