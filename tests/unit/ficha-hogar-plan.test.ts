import { describe, it, expect } from 'vitest'
import { resolveFichaHogarQuestions, fichaHogarQuestionCount } from '@/lib/conversation/ficha-hogar-plan'

describe('resolveFichaHogarQuestions — per-country Ficha Hogar (Fase 4)', () => {
  it('CAM/RD and unknown countries get the shared 7-question list, re-indexed 1..7', () => {
    for (const c of ['Guatemala', 'Honduras', null, 'Narnia']) {
      const qs = resolveFichaHogarQuestions(c)
      expect(qs).toHaveLength(7)
      expect(fichaHogarQuestionCount(c)).toBe(7)
      qs.forEach((q, i) => expect(q.index).toBe(i + 1))
      expect(qs.map((q) => q.fieldName)).toEqual([
        'conflictOfInterest',
        'hasInternet',
        'relationshipToHoh',
        'dateOfBirth',
        'hasHealthCondition',
        'unlimitedDataPlan',
        'petCount',
      ])
    }
  })

  it('México keeps the shared 7-question list (unchanged)', () => {
    expect(resolveFichaHogarQuestions('México').map((q) => q.fieldName)).toEqual(
      resolveFichaHogarQuestions('Guatemala').map((q) => q.fieldName),
    )
  })

  it('Ecuador gets its own 6-question list — no "acceso a internet", re-indexed 1..6 (doc §4)', () => {
    const qs = resolveFichaHogarQuestions('Ecuador')
    expect(qs).toHaveLength(6)
    expect(fichaHogarQuestionCount('Ecuador')).toBe(6)
    qs.forEach((q, i) => expect(q.index).toBe(i + 1))
    expect(qs.map((q) => q.fieldName)).toEqual([
      'conflictOfInterest',
      'relationshipToHoh',
      'dateOfBirth',
      'hasHealthCondition',
      'unlimitedDataPlan',
      'petCount',
    ])
    expect(qs.map((q) => q.fieldName)).not.toContain('hasInternet')
  })
})
