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

interface GeoLabels {
  stateProvinceLabel: string | null
  municipalityLabel: string | null
  neighborhoodLabel: string | null
}

const GEO_LABEL_BY_FIELD: Record<string, keyof GeoLabels> = {
  stateProvince: 'stateProvinceLabel',
  municipality: 'municipalityLabel',
  neighborhood: 'neighborhoodLabel',
}

/**
 * Given a lead's country-resolved question list, the 1-based index the survey is about to
 * send, the lead's persisted field values, and the country's geo labels, return the index
 * of the next question that should actually be SENT — skipping (transitively) any question
 * that is either already answered or a geo question this country does not ask. The
 * question list, its length, and every position are UNCHANGED — this only decides which
 * positions are sent, advancing `survey_question_index` past a skipped one exactly as the
 * pre-016 inline skips did (spec 016 contracts/survey-preanswered-skip.md).
 *
 * Skip rules for the field `f` at position `i`:
 *  1. Pre-answered — `answered[f] != null` (today only `country`, set by a chat room).
 *  2. Geo question the country doesn't ask — `f` ∈ {stateProvince, municipality,
 *     neighborhood} and the matching `geoLabels.*Label` is null (CAM: only `neighborhood`).
 *
 * If everything from `fromIndex` on is skipped, returns `questions.length + 1` (complete).
 */
export function nextQuestionToSend(
  questions: readonly SurveyQuestion[],
  fromIndex: number,
  answered: Partial<Record<string, unknown>>,
  geoLabels: GeoLabels,
): { index: number; skipped: string[] } {
  const skipped: string[] = []
  let index = fromIndex
  while (index >= 1 && index <= questions.length) {
    const field = questions[index - 1].fieldName
    const preAnswered = answered[field] != null
    const geoLabelKey = GEO_LABEL_BY_FIELD[field]
    const geoNotAsked = geoLabelKey !== undefined && geoLabels[geoLabelKey] == null
    if (!preAnswered && !geoNotAsked) break
    skipped.push(field)
    index += 1
  }
  return { index, skipped }
}

/** `nextQuestionToSend` bound to a country — resolves the list + geo labels for callers
 *  that only have the country string and the answered-field map. */
export function nextQuestionForCountry(
  country: string | null | undefined,
  fromIndex: number,
  answered: Partial<Record<string, unknown>>,
): { index: number; skipped: string[] } {
  return nextQuestionToSend(
    resolveSurveyQuestions(country),
    fromIndex,
    answered,
    getCountryConfig(country).geoHierarchy,
  )
}
