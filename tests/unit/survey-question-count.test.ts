import { describe, it, expect } from 'vitest'
import { SURVEY_QUESTIONS, SURVEY_QUESTION_COUNT } from '@/lib/conversation/survey-questions'
import { SURVEY_FIELDS } from '@/types/lead'

describe('SURVEY_QUESTIONS / SURVEY_FIELDS stay in sync (research.md R4)', () => {
  it('SURVEY_QUESTION_COUNT matches both array lengths', () => {
    expect(SURVEY_QUESTION_COUNT).toBe(19)
    expect(SURVEY_QUESTIONS.length).toBe(SURVEY_QUESTION_COUNT)
    expect(SURVEY_FIELDS.length).toBe(SURVEY_QUESTION_COUNT)
  })

  it('every SURVEY_QUESTIONS entry field name matches SURVEY_FIELDS at the same position', () => {
    SURVEY_QUESTIONS.forEach((q, i) => {
      expect(q.fieldName).toBe(SURVEY_FIELDS[i])
      expect(q.index).toBe(i + 1)
    })
  })

  it('age/isPregnant/hasBabyUnder3 sit at their actual Kantar-questionnaire positions, not appended at the end', () => {
    // Reordered to match the literal question order in docs/Preguntas_Kantar_CAM_Ecuador_México
    // (...xlsx) — age right after gender (Q8), isPregnant/hasBabyUnder3 right after
    // householdSize (Q13-14). Previously all three were appended after Q16 (contactSchedule);
    // that was a deliberate simplification, not a requirement — see spec 010 amendment.
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
})
