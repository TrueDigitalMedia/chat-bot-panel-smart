import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'
import { lookupNseRegion } from '@/lib/geo/cam-nse-catalog'
import type { LeadStatus } from '@/types/lead'

export const EVAL_VERSION = 'v1'
export const EVAL_PASS_THRESHOLD = 80

/** Phase-1 terminal reasons that trigger a conversation eval. */
export const PHASE1_EVAL_REASONS = new Set([
  'd1_decline',
  'd3_no',
  'nse_geo_out_of_sample',
  'nse_geo_out_of_sample_manual',
  'survey_complete_no_quota',
  'survey_complete_quota_available',
])

/** Statuses that imply Phase 1 already passed with quota (for backfill / late eval). */
export const POST_QUOTA_STATUSES = new Set([
  'link_sent',
  'waiting_for_code',
  'code_delivered_registered',
  'code_delivered_not_registered',
  'code_delivered_no_response',
  'ficha_hogar_completada',
])

/**
 * Infer Phase-1 eval reason from persisted lead state (manual / backfill).
 * Returns null when the conversation is still incomplete or not evaluable.
 */
export function inferPhase1EvalReason(actual: QualificationActual): string | null {
  const status = actual.leadStatus

  if (status === 'not_qualified') {
    return 'd1_decline'
  }

  if (status === 'quota_exhausted') {
    if (actual.d3IsShopper === false) return 'd3_no'
    if (actual.inQuotaGeo === false) return 'nse_geo_out_of_sample'
    if (actual.score != null || scoringFieldsPresent(actual)) {
      return 'survey_complete_no_quota'
    }
    // Geo out without explicit flag still treated as geo gate
    if (actual.country && actual.stateProvince && actual.municipality) {
      return 'nse_geo_out_of_sample'
    }
    return 'd3_no'
  }

  if (POST_QUOTA_STATUSES.has(status)) {
    return 'survey_complete_quota_available'
  }

  return null
}

function scoringFieldsPresent(actual: QualificationActual): boolean {
  return (
    actual.educationPsh != null ||
    actual.cars != null ||
    actual.domesticHelp != null ||
    actual.householdSize != null ||
    actual.bedrooms != null
  )
}

export function statusMatchesExpected(
  actualStatus: string,
  expectedStatus: string,
): boolean {
  if (actualStatus === expectedStatus) return true
  // Lead may have advanced past Phase 1 after a correct quota pass
  if (expectedStatus === 'link_sent' && POST_QUOTA_STATUSES.has(actualStatus)) {
    return true
  }
  return false
}

export type EvalScenarioType =
  | 'd1_decline'
  | 'd3_no'
  | 'geo_out'
  | 'survey_complete_no_quota'
  | 'survey_complete_quota_available'

export interface QualificationActual {
  leadStatus: LeadStatus | string
  d1Accepted: boolean
  d3IsShopper: boolean | null
  score: number | null
  quotaSegment: string | null
  country: string | null
  stateProvince: string | null
  municipality: string | null
  nseRegion: string | null
  inQuotaGeo: boolean | null
  educationPsh: string | null
  cars: string | null
  domesticHelp: boolean | null
  householdSize: number | null
  bedrooms: number | null
}

export interface QualificationExpected {
  leadStatus: LeadStatus | string
  inQuotaGeo?: boolean | null
  nseRegion?: string | null
  score?: number | null
  quotaSegment?: string | null
  /** When true, socioeconomic score/segment must be present and match recalculation. */
  requireScoring?: boolean
  /** When true, geo must have been evaluated (inQuotaGeo not null). */
  requireGeo?: boolean
}

export interface EvalChecks {
  status_correct: boolean
  qualification_correct: boolean
  geo_quota_correct: boolean
  segment_correct: boolean
  socioeconomic_score_correct: boolean
}

export interface EvalMismatch {
  field: string
  expected: unknown
  actual: unknown
}

export interface QualificationEvalResult {
  overallScore: number
  passed: boolean
  checks: EvalChecks
  expected: QualificationExpected
  mismatches: EvalMismatch[]
  scenarioType: EvalScenarioType
  recalculatedScore: number | null
  recalculatedSegment: string | null
  catalogNseRegion: string | null
}

const WEIGHTS: Record<keyof EvalChecks, number> = {
  status_correct: 30,
  qualification_correct: 25,
  geo_quota_correct: 25,
  segment_correct: 10,
  socioeconomic_score_correct: 10,
}

export function reasonToScenarioType(reason: string): EvalScenarioType {
  if (reason === 'd1_decline') return 'd1_decline'
  if (reason === 'd3_no') return 'd3_no'
  if (reason === 'nse_geo_out_of_sample' || reason === 'nse_geo_out_of_sample_manual') {
    return 'geo_out'
  }
  if (reason === 'survey_complete_no_quota') return 'survey_complete_no_quota'
  return 'survey_complete_quota_available'
}

export function deriveExpected(
  reason: string,
  actual: QualificationActual,
): QualificationExpected {
  const scenario = reasonToScenarioType(reason)

  switch (scenario) {
    case 'd1_decline':
      return { leadStatus: 'not_qualified', requireScoring: false, requireGeo: false }
    case 'd3_no':
      return { leadStatus: 'quota_exhausted', requireScoring: false, requireGeo: false }
    case 'geo_out': {
      const catalogNse =
        actual.country && actual.stateProvince && actual.municipality
          ? lookupNseRegion(actual.country, actual.stateProvince, actual.municipality)
          : null
      return {
        leadStatus: 'quota_exhausted',
        inQuotaGeo: false,
        nseRegion: catalogNse, // expect null when truly out
        requireScoring: false,
        requireGeo: true,
      }
    }
    case 'survey_complete_no_quota':
    case 'survey_complete_quota_available': {
      const recalc = calculateScore({
        educationPsh: actual.educationPsh,
        cars: actual.cars,
        domesticHelp: actual.domesticHelp,
        householdSize: actual.householdSize,
        bedrooms: actual.bedrooms,
      })
      const segment = getQuotaSegment(recalc)
      const catalogNse =
        actual.country && actual.stateProvince && actual.municipality
          ? lookupNseRegion(actual.country, actual.stateProvince, actual.municipality)
          : null
      return {
        leadStatus:
          scenario === 'survey_complete_no_quota' ? 'quota_exhausted' : 'link_sent',
        inQuotaGeo: true,
        nseRegion: catalogNse,
        score: recalc,
        quotaSegment: segment,
        requireScoring: true,
        requireGeo: true,
      }
    }
  }
}

function scoringPresent(actual: QualificationActual): boolean {
  return scoringFieldsPresent(actual)
}

export function runQualificationEval(
  reason: string,
  actual: QualificationActual,
  fixtureExpected?: Partial<QualificationExpected> | null,
): QualificationEvalResult {
  const derived = deriveExpected(reason, actual)
  const expected: QualificationExpected = {
    ...derived,
    ...(fixtureExpected ?? {}),
    // Status from reason always wins over fixture drift
    leadStatus: derived.leadStatus,
  }

  const scenarioType = reasonToScenarioType(reason)
  const recalculatedScore = scoringPresent(actual)
    ? calculateScore({
        educationPsh: actual.educationPsh,
        cars: actual.cars,
        domesticHelp: actual.domesticHelp,
        householdSize: actual.householdSize,
        bedrooms: actual.bedrooms,
      })
    : null
  const recalculatedSegment =
    recalculatedScore != null ? getQuotaSegment(recalculatedScore) : null
  const catalogNseRegion =
    actual.country && actual.stateProvince && actual.municipality
      ? lookupNseRegion(actual.country, actual.stateProvince, actual.municipality)
      : null

  const mismatches: EvalMismatch[] = []

  const status_correct = statusMatchesExpected(
    String(actual.leadStatus),
    String(expected.leadStatus),
  )
  if (!status_correct) {
    mismatches.push({
      field: 'leadStatus',
      expected: expected.leadStatus,
      actual: actual.leadStatus,
    })
  }

  const qualification_correct = checkQualification(reason, actual)
  if (!qualification_correct) {
    mismatches.push({
      field: 'qualification',
      expected: reasonToScenarioType(reason),
      actual: {
        d1Accepted: actual.d1Accepted,
        d3IsShopper: actual.d3IsShopper,
        leadStatus: actual.leadStatus,
      },
    })
  }

  const geo_quota_correct = checkGeo(expected, actual, catalogNseRegion, mismatches)

  let socioeconomic_score_correct = true
  let segment_correct = true
  if (expected.requireScoring) {
    socioeconomic_score_correct =
      recalculatedScore != null && actual.score === recalculatedScore
    if (!socioeconomic_score_correct) {
      mismatches.push({
        field: 'score',
        expected: recalculatedScore,
        actual: actual.score,
      })
    }
    segment_correct =
      recalculatedSegment != null && actual.quotaSegment === recalculatedSegment
    if (!segment_correct) {
      mismatches.push({
        field: 'quotaSegment',
        expected: recalculatedSegment,
        actual: actual.quotaSegment,
      })
    }
  }

  const checks: EvalChecks = {
    status_correct,
    qualification_correct,
    geo_quota_correct,
    segment_correct,
    socioeconomic_score_correct,
  }

  let overallScore = 0
  for (const key of Object.keys(WEIGHTS) as (keyof EvalChecks)[]) {
    if (checks[key]) overallScore += WEIGHTS[key]
  }

  // Score is informational; pass requires threshold AND zero mismatches
  // (wrong SES score alone is 90/100 but must still fail QA).
  const passed = overallScore >= EVAL_PASS_THRESHOLD && mismatches.length === 0

  return {
    overallScore,
    passed,
    checks,
    expected,
    mismatches,
    scenarioType,
    recalculatedScore,
    recalculatedSegment,
    catalogNseRegion,
  }
}

function checkQualification(reason: string, actual: QualificationActual): boolean {
  const scenario = reasonToScenarioType(reason)
  switch (scenario) {
    case 'd1_decline':
      return actual.d1Accepted === false && actual.leadStatus === 'not_qualified'
    case 'd3_no':
      return (
        actual.d1Accepted === true &&
        actual.d3IsShopper === false &&
        actual.leadStatus === 'quota_exhausted'
      )
    case 'geo_out':
      return (
        actual.d1Accepted === true &&
        actual.d3IsShopper === true &&
        actual.leadStatus === 'quota_exhausted'
      )
    case 'survey_complete_no_quota':
    case 'survey_complete_quota_available':
      return actual.d1Accepted === true && actual.d3IsShopper === true
  }
}

function checkGeo(
  expected: QualificationExpected,
  actual: QualificationActual,
  catalogNseRegion: string | null,
  mismatches: EvalMismatch[],
): boolean {
  if (!expected.requireGeo) return true

  if (expected.inQuotaGeo === false) {
    // Out of sample: must be marked false, and catalog must not match (or geo incomplete)
    const inQuotaOk = actual.inQuotaGeo === false
    if (!inQuotaOk) {
      mismatches.push({
        field: 'inQuotaGeo',
        expected: false,
        actual: actual.inQuotaGeo,
      })
    }
    // If we have full geo and catalog says IN, that's a logic bug
    const catalogConsistency =
      !(actual.country && actual.stateProvince && actual.municipality) ||
      catalogNseRegion === null
    if (!catalogConsistency) {
      mismatches.push({
        field: 'catalogNseRegion',
        expected: null,
        actual: catalogNseRegion,
      })
    }
    return inQuotaOk && catalogConsistency
  }

  if (expected.inQuotaGeo === true) {
    const inQuotaOk = actual.inQuotaGeo === true
    if (!inQuotaOk) {
      mismatches.push({
        field: 'inQuotaGeo',
        expected: true,
        actual: actual.inQuotaGeo,
      })
    }
    const regionOk =
      expected.nseRegion == null ||
      actual.nseRegion === expected.nseRegion ||
      actual.nseRegion === catalogNseRegion
    if (!regionOk) {
      mismatches.push({
        field: 'nseRegion',
        expected: expected.nseRegion ?? catalogNseRegion,
        actual: actual.nseRegion,
      })
    }
    const catalogOk = catalogNseRegion != null
    if (!catalogOk) {
      mismatches.push({
        field: 'catalogNseRegion',
        expected: 'in-catalog municipality',
        actual: null,
      })
    }
    return inQuotaOk && regionOk && catalogOk
  }

  return true
}
