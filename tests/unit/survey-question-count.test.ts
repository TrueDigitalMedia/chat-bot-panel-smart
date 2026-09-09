import { describe, it, expect } from 'vitest'
import { resolveSurveyQuestions, surveyQuestionCount } from '@/lib/conversation/survey-plan'
import { SURVEY_FIELDS } from '@/types/lead'

// Feature 014: SURVEY_QUESTIONS / SURVEY_QUESTION_COUNT are gone — every CAM/RD country
// now resolves through resolveSurveyQuestions(country)/surveyQuestionCount(country). For
// a CAM/RD country this MUST stay byte-identical to the pre-014 fixed array (research.md R4).
describe('resolveSurveyQuestions(CAM) / SURVEY_FIELDS stay in sync (research.md R4)', () => {
  const questions = resolveSurveyQuestions('Guatemala')

  it('surveyQuestionCount matches both array lengths', () => {
    expect(surveyQuestionCount('Guatemala')).toBe(19)
    expect(questions.length).toBe(19)
    expect(SURVEY_FIELDS.length).toBe(19)
  })

  it('every resolved question field name matches SURVEY_FIELDS at the same position', () => {
    questions.forEach((q, i) => {
      expect(q.fieldName).toBe(SURVEY_FIELDS[i])
      expect(q.index).toBe(i + 1)
    })
  })

  it('age/isPregnant/hasBabyUnder3 sit at their actual Kantar-questionnaire positions, not appended at the end', () => {
    // Reordered to match the literal question order in docs/cam/Preguntas_Kantar_CAM.xlsx —
    // age right after gender (Q8), isPregnant/hasBabyUnder3 right after householdSize
    // (Q13-14). Previously all three were appended after Q16 (contactSchedule); that was
    // a deliberate simplification, not a requirement — see spec 010 amendment.
    expect(SURVEY_FIELDS).toEqual([
      'fullName',
      'country',
      'stateProvince',
      'municipality',
      'neighborhood',
      'email',
      'gender',
      'age',
      'educationPsh',
      'cars',
      'domesticHelp',
      'householdSize',
      'isPregnant',
      'hasBabyUnder3',
      'bedrooms',
      'shoppingFrequency',
      'shoppingCategories',
      'contactChannel',
      'contactSchedule',
    ])
  })

  it('every CAM/RD country name resolves to the same 19-question list', () => {
    const camNames = ['Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Rep. Dominicana', 'Panamá']
    for (const name of camNames) {
      expect(resolveSurveyQuestions(name).map((q) => q.fieldName)).toEqual(questions.map((q) => q.fieldName))
    }
    // Unknown/null country falls back to the CAM default (back-compat).
    expect(resolveSurveyQuestions(null).map((q) => q.fieldName)).toEqual(questions.map((q) => q.fieldName))
  })
})
