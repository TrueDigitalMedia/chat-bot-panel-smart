import { describe, it, expect } from 'vitest'
import {
  runQualificationEval,
  deriveExpected,
  reasonToScenarioType,
  inferPhase1EvalReason,
  statusMatchesExpected,
} from '@/lib/eval/qualification-eval'
import type { QualificationActual } from '@/lib/eval/qualification-eval'

function baseActual(overrides: Partial<QualificationActual> = {}): QualificationActual {
  return {
    leadStatus: 'incomplete',
    d1Accepted: false,
    d2Accepted: null,
    d3IsShopper: null,
    score: null,
    quotaSegment: null,
    country: null,
    stateProvince: null,
    municipality: null,
    nseRegion: null,
    inQuotaGeo: null,
    educationPsh: null,
    cars: null,
    domesticHelp: null,
    householdSize: null,
    bedrooms: null,
    ...overrides,
  }
}

describe('reasonToScenarioType', () => {
  it('maps geo reasons to geo_out', () => {
    expect(reasonToScenarioType('nse_geo_out_of_sample')).toBe('geo_out')
    expect(reasonToScenarioType('nse_geo_out_of_sample_manual')).toBe('geo_out')
  })
})

describe('runQualificationEval', () => {
  it('passes D1 decline', () => {
    const actual = baseActual({
      leadStatus: 'not_qualified',
      d1Accepted: false,
    })
    const result = runQualificationEval('d1_decline', actual)
    expect(result.passed).toBe(true)
    expect(result.overallScore).toBe(100)
    expect(result.checks.status_correct).toBe(true)
    expect(result.checks.qualification_correct).toBe(true)
  })

  it('fails D1 decline if status is wrong', () => {
    const actual = baseActual({
      leadStatus: 'link_sent',
      d1Accepted: false,
    })
    const result = runQualificationEval('d1_decline', actual)
    expect(result.passed).toBe(false)
    expect(result.checks.status_correct).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'leadStatus')).toBe(true)
  })

  it('passes D3 no shopper', () => {
    const actual = baseActual({
      leadStatus: 'quota_exhausted',
      d1Accepted: true,
      d2Accepted: true,
      d3IsShopper: false,
    })
    const result = runQualificationEval('d3_no', actual)
    expect(result.passed).toBe(true)
    expect(result.checks.qualification_correct).toBe(true)
  })

  it('passes geo out of catalog', () => {
    const actual = baseActual({
      leadStatus: 'quota_exhausted',
      d1Accepted: true,
      d2Accepted: true,
      d3IsShopper: true,
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Municipio Inventado XYZ',
      inQuotaGeo: false,
      nseRegion: null,
    })
    const result = runQualificationEval('nse_geo_out_of_sample', actual)
    expect(result.catalogNseRegion).toBeNull()
    expect(result.checks.geo_quota_correct).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('fails geo out when municipality is actually in catalog', () => {
    const actual = baseActual({
      leadStatus: 'quota_exhausted',
      d1Accepted: true,
      d2Accepted: true,
      d3IsShopper: true,
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Guatemala',
      inQuotaGeo: false,
      nseRegion: null,
    })
    const result = runQualificationEval('nse_geo_out_of_sample', actual)
    expect(result.catalogNseRegion).toBe('Centro II')
    expect(result.checks.geo_quota_correct).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('passes survey complete with quota available and correct SES score', () => {
    const actual = baseActual({
      leadStatus: 'link_sent',
      d1Accepted: true,
      d2Accepted: true,
      d3IsShopper: true,
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Guatemala',
      inQuotaGeo: true,
      nseRegion: 'Centro II',
      educationPsh: 'Pos Grado Completo',
      cars: '2 o más',
      domesticHelp: true,
      householdSize: 2,
      bedrooms: 4,
      score: 1000,
      quotaSegment: 'Nivel 1',
    })
    const result = runQualificationEval('survey_complete_quota_available', actual)
    expect(result.recalculatedScore).toBe(1000)
    expect(result.recalculatedSegment).toBe('Nivel 1')
    expect(result.checks.socioeconomic_score_correct).toBe(true)
    expect(result.checks.segment_correct).toBe(true)
    expect(result.checks.geo_quota_correct).toBe(true)
    expect(result.passed).toBe(true)
    expect(result.overallScore).toBe(100)
  })

  it('fails when stored score mismatches recalculation', () => {
    const actual = baseActual({
      leadStatus: 'link_sent',
      d1Accepted: true,
      d2Accepted: true,
      d3IsShopper: true,
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Guatemala',
      inQuotaGeo: true,
      nseRegion: 'Centro II',
      educationPsh: 'Pos Grado Completo',
      cars: '2 o más',
      domesticHelp: true,
      householdSize: 2,
      bedrooms: 4,
      score: 99,
      quotaSegment: 'Nivel 1',
    })
    const result = runQualificationEval('survey_complete_quota_available', actual)
    expect(result.checks.socioeconomic_score_correct).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('passes survey complete no quota slot with low SES', () => {
    const actual = baseActual({
      leadStatus: 'quota_exhausted',
      d1Accepted: true,
      d2Accepted: true,
      d3IsShopper: true,
      country: 'Guatemala',
      stateProvince: 'Guatemala',
      municipality: 'Guatemala',
      inQuotaGeo: true,
      nseRegion: 'Centro II',
      educationPsh: 'No alfabetizado',
      cars: '0',
      domesticHelp: false,
      householdSize: 8,
      bedrooms: 1,
      score: 0,
      quotaSegment: 'Nivel 4',
    })
    const result = runQualificationEval('survey_complete_no_quota', actual)
    expect(result.expected.leadStatus).toBe('quota_exhausted')
    expect(result.passed).toBe(true)
  })
})

describe('deriveExpected', () => {
  it('expects link_sent for quota available path', () => {
    const expected = deriveExpected(
      'survey_complete_quota_available',
      baseActual({
        educationPsh: 'Pos Grado Completo',
        cars: '2 o más',
        domesticHelp: true,
        householdSize: 2,
        bedrooms: 4,
        country: 'Guatemala',
        stateProvince: 'Guatemala',
        municipality: 'Guatemala',
      }),
    )
    expect(expected.leadStatus).toBe('link_sent')
    expect(expected.score).toBe(1000)
    expect(expected.quotaSegment).toBe('Nivel 1')
    expect(expected.nseRegion).toBe('Centro II')
  })
})

describe('inferPhase1EvalReason', () => {
  it('infers d1 decline', () => {
    expect(
      inferPhase1EvalReason(
        baseActual({ leadStatus: 'not_qualified', d1Accepted: false }),
      ),
    ).toBe('d1_decline')
  })

  it('infers geo out', () => {
    expect(
      inferPhase1EvalReason(
        baseActual({
          leadStatus: 'quota_exhausted',
          d1Accepted: true,
          d2Accepted: true,
          d3IsShopper: true,
          inQuotaGeo: false,
          country: 'Guatemala',
          stateProvince: 'Guatemala',
          municipality: 'X',
        }),
      ),
    ).toBe('nse_geo_out_of_sample')
  })

  it('infers quota available for advanced statuses', () => {
    expect(
      inferPhase1EvalReason(baseActual({ leadStatus: 'waiting_for_code' })),
    ).toBe('survey_complete_quota_available')
  })

  it('returns null for incomplete', () => {
    expect(inferPhase1EvalReason(baseActual({ leadStatus: 'incomplete' }))).toBeNull()
  })
})

describe('statusMatchesExpected', () => {
  it('accepts later statuses when expected is link_sent', () => {
    expect(statusMatchesExpected('ficha_hogar_completada', 'link_sent')).toBe(true)
    expect(statusMatchesExpected('not_qualified', 'link_sent')).toBe(false)
  })
})
