import { SHARED_PREFIX, SHARED_SUFFIX } from './survey-questions'
import type { SurveyQuestion } from './survey-questions'
import { getCountryConfig } from '@/lib/countries/registry'

/**
 * The country-resolved survey question list — SHARED_PREFIX + the country's own
 * scoringQuestions (screening + NSE variables + household size + pregnancy/baby) +
 * SHARED_SUFFIX, re-indexed 1..N. For every CAM/RD country this is byte-identical to the
 * pre-014 fixed SURVEY_QUESTIONS array (see tests/unit/country-config-registry.test.ts).
 */
export function resolveSurveyQuestions(country: string | null | undefined): SurveyQuestion[] {
  const cfg = getCountryConfig(country)
  const combined = [...SHARED_PREFIX, ...cfg.scoringQuestions, ...SHARED_SUFFIX]
  return combined.map((q, i) => ({ ...q, index: i + 1 }))
}

/** Single source of truth for the survey's total question count for a given country. */
export function surveyQuestionCount(country: string | null | undefined): number {
  return resolveSurveyQuestions(country).length
}
