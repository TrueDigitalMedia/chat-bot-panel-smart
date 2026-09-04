import type { InlineKeyboardButton } from '@/types/telegram'
import type { SurveyQuestion } from '@/lib/conversation/survey-questions'

/**
 * Country-configuration registry (constitution v1.2.0 Principle V). `getCountryConfig`
 * (registry.ts) is the ONLY place a country name is switched on — everything else in the
 * conversation/scoring/geo pipeline calls through a `CountryConfig` instance instead of
 * branching on the country string. See specs/014-ecuador-onboarding/contracts/country-config.md.
 */

export interface NseResult {
  /** Country point total (>= 0). */
  points: number
  /** MUST be one of CountryConfig.nseLevels. */
  level: string
}

export interface GeoHierarchy {
  /** Survey Q3 noun, e.g. "provincia" / "departamento". */
  stateProvinceLabel: string
  /** Survey Q4 noun, e.g. "cantón" / "municipio". */
  municipalityLabel: string
  /** Survey Q5 noun, or null to keep Q5 hidden (CAM default). */
  neighborhoodLabel: string | null
}

export interface CountryConfig {
  /** Canonical country name — the exact string stored on leads/survey_profiles/quota rows. */
  country: string
  /** Ordered high -> low. The exact strings written to `leads.quota_segment`. */
  nseLevels: readonly string[]
  geoHierarchy: GeoHierarchy
  /** Inserted between SHARED_PREFIX and SHARED_SUFFIX in the resolved survey. */
  scoringQuestions: readonly SurveyQuestion[]
  /** Sensitive-industry screening options for the conflict-of-interest question. */
  screeningIndustries: readonly InlineKeyboardButton[][]
  computeNse(answers: Record<string, unknown>): NseResult
  /** null = out of geographic quota. */
  resolveNseRegion(geo: {
    stateProvince: string | null
    municipality: string | null
    neighborhood: string | null
  }): string | null
  validatePhone(raw: string): { ok: boolean; normalized: string | null }
}
