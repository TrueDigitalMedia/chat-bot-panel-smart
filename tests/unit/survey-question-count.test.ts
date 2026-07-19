import { describe, it, expect } from 'vitest'
import { SURVEY_QUESTIONS, SURVEY_QUESTION_COUNT } from '@/lib/conversation/survey-questions'
import { SURVEY_FIELDS } from '@/types/lead'

describe('SURVEY_QUESTIONS / SURVEY_FIELDS stay in sync (research.md R4)', () => {
  it('SURVEY_QUESTION_COUNT matches both array lengths', () => {
    expect(SURVEY_QUESTION_COUNT).toBe(19)
    expect(SURVEY_QUESTIONS.length).toBe(SURVEY_QUESTION_COUNT)
    expect(SURVEY_FIELDS.length).toBe(SURVEY_QUESTION_COUNT)
  })

  it('the last 3 entries of both arrays are age, isPregnant, hasBabyUnder3 in that order (research.md R1)', () => {
    expect(SURVEY_FIELDS.slice(-3)).toEqual(['age', 'isPregnant', 'hasBabyUnder3'])
    expect(SURVEY_QUESTIONS.slice(-3).map((q) => q.fieldName)).toEqual([
      'age',
      'isPregnant',
      'hasBabyUnder3',
    ])
  })

  it('every SURVEY_QUESTIONS entry field name matches SURVEY_FIELDS at the same position', () => {
    SURVEY_QUESTIONS.forEach((q, i) => {
      expect(q.fieldName).toBe(SURVEY_FIELDS[i])
      expect(q.index).toBe(i + 1)
    })
  })

  it('the original 16 questions kept their exact positions (production-safety regression guard)', () => {
    expect(SURVEY_FIELDS.slice(0, 16)).toEqual([
      'fullName',
      'country',
      'stateProvince',
      'municipality',
      'neighborhood',
      'email',
      'gender',
      'educationPsh',
      'cars',
      'domesticHelp',
      'householdSize',
      'bedrooms',
      'shoppingFrequency',
      'shoppingCategories',
      'contactChannel',
      'contactSchedule',
    ])
  })
})
