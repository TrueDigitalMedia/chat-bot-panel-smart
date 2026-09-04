import { describe, it, expect } from 'vitest'
import { resolveSurveyQuestions, surveyQuestionCount } from '@/lib/conversation/survey-plan'

describe('resolveSurveyQuestions / surveyQuestionCount — CAM (unchanged)', () => {
  it('resolves 19 questions for a CAM country, re-indexed 1..19', () => {
    const questions = resolveSurveyQuestions('Guatemala')
    expect(questions.length).toBe(19)
    expect(surveyQuestionCount('Guatemala')).toBe(19)
    questions.forEach((q, i) => expect(q.index).toBe(i + 1))
  })

  it('null/undefined country falls back to the same 19-question CAM list', () => {
    expect(resolveSurveyQuestions(null).length).toBe(19)
    expect(surveyQuestionCount(null)).toBe(19)
  })
})

describe('resolveSurveyQuestions / surveyQuestionCount — Ecuador', () => {
  const questions = resolveSurveyQuestions('Ecuador')

  it('resolves the shared prefix (8) + Ecuador scoring block (13) + shared suffix (4) = 25 questions', () => {
    // Ecuador's scoring block: conflictOfInterest, 5 NSE vars (health/income/finishes/
    // floor/vehicles), occupationHead, occupationAma, educationPsh, householdSize,
    // isPregnant, hasBabyUnder3, internetAccess = 13.
    expect(questions.length).toBe(25)
    expect(surveyQuestionCount('Ecuador')).toBe(25)
  })

  it('is re-indexed 1..24 with no gaps', () => {
    questions.forEach((q, i) => expect(q.index).toBe(i + 1))
  })

  it('starts with the shared prefix in the same order as CAM', () => {
    const camPrefix = resolveSurveyQuestions('Guatemala').slice(0, 8).map((q) => q.fieldName)
    expect(questions.slice(0, 8).map((q) => q.fieldName)).toEqual(camPrefix)
  })

  it('ends with the same shared suffix (shopping/contact) as CAM', () => {
    const camSuffix = resolveSurveyQuestions('Guatemala').slice(-4).map((q) => q.fieldName)
    expect(questions.slice(-4).map((q) => q.fieldName)).toEqual(camSuffix)
  })

  it('places the 13 Ecuador-specific scoring fields between prefix and suffix, in spec order', () => {
    expect(questions.slice(8, 21).map((q) => q.fieldName)).toEqual([
      'conflictOfInterest',
      'healthInsurancePsh',
      'monthlyIncome',
      'dwellingFinishes',
      'floorMaterial',
      'vehicleCount',
      'occupationHead',
      'occupationAma',
      'educationPsh',
      'householdSize',
      'isPregnant',
      'hasBabyUnder3',
      'internetAccess',
    ])
  })

  it('has its own Q5 (neighborhood/parroquia) as a real, non-hidden field — unlike CAM', () => {
    const country = questions[1]
    expect(country.fieldName).toBe('country')
    const neighborhood = questions[4]
    expect(neighborhood.fieldName).toBe('neighborhood')
  })
})

describe('resolveSurveyQuestions — cross-country isolation', () => {
  it('Ecuador and CAM question counts differ, and neither list contains the other’s exclusive fields', () => {
    const ecuador = resolveSurveyQuestions('Ecuador').map((q) => q.fieldName)
    const cam = resolveSurveyQuestions('Honduras').map((q) => q.fieldName)
    expect(ecuador).not.toEqual(cam)
    expect(cam).not.toContain('conflictOfInterest')
    expect(cam).not.toContain('healthInsurancePsh')
    expect(ecuador).not.toContain('cars')
    expect(ecuador).not.toContain('domesticHelp')
    expect(ecuador).not.toContain('bedrooms')
  })
})
