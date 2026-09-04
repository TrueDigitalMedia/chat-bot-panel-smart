/**
 * Country-configuration registry — constitution v1.2.0 Principle V: this file is the
 * ONLY place a country name is switched on. Every other conversation/scoring/geo module
 * calls through the returned CountryConfig instead of branching on the country string.
 */
import { makeCamConfig } from './cam'
import { ecuadorConfig } from './ecuador'
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
  return camConfigs.get(country) ?? defaultCamConfig
}

/** True when `country` resolves to a real (non-fallback) CountryConfig. */
export function isSupportedCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return country === 'Ecuador' || camConfigs.has(country)
}
