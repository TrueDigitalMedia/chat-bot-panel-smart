import { describe, it, expect } from 'vitest'
import { nextQuestionToSend, resolveSurveyQuestions } from '@/lib/conversation/survey-plan'

// spec 016 contracts/survey-preanswered-skip.md. The resolved question list is unchanged;
// this helper only decides which positions get SENT.

const ECUADOR_GEO = { stateProvinceLabel: 'provincia', municipalityLabel: 'cantón', neighborhoodLabel: 'parroquia' }
const CAM_GEO = { stateProvinceLabel: 'provincia/departamento', municipalityLabel: 'municipio', neighborhoodLabel: null }

describe('nextQuestionToSend', () => {
  const ecuadorQs = resolveSurveyQuestions('Ecuador')
  const camQs = resolveSurveyQuestions('Guatemala')

  it('nothing pre-answered, Ecuador geo labels (all non-null) -> returns fromIndex unchanged', () => {
    expect(nextQuestionToSend(ecuadorQs, 3, {}, ECUADOR_GEO)).toEqual({ index: 3, skipped: [] })
  })

  it('country pre-answered at index 2 -> returns 3, skipped ["country"]', () => {
    // question 2 is `country`
    expect(nextQuestionToSend(ecuadorQs, 2, { country: 'Ecuador' }, ECUADOR_GEO)).toEqual({
      index: 3,
      skipped: ['country'],
    })
  })

  it('CAM geo labels (neighborhoodLabel null), reaching position 5 -> returns 6, skipped ["neighborhood"]', () => {
    // question 5 is `neighborhood`
    expect(camQs[4].fieldName).toBe('neighborhood')
    expect(nextQuestionToSend(camQs, 5, {}, CAM_GEO)).toEqual({ index: 6, skipped: ['neighborhood'] })
  })

  it('a pre-answered country AND a null neighborhoodLabel are skipped transitively', () => {
    // From index 2 on a CAM list with country pre-answered: skip country(2), then
    // stateProvince(3)/municipality(4) are still asked (labels non-null), so it stops at 3.
    expect(nextQuestionToSend(camQs, 2, { country: 'Guatemala' }, CAM_GEO)).toEqual({
      index: 3,
      skipped: ['country'],
    })
    // From index 5 (neighborhood) on that same lead: skip neighborhood(5) -> land on email(6).
    expect(nextQuestionToSend(camQs, 5, { country: 'Guatemala' }, CAM_GEO)).toEqual({
      index: 6,
      skipped: ['neighborhood'],
    })
  })

  it('everything remaining skipped -> returns length + 1 (survey complete)', () => {
    // Build an "answered" map that fills every field from fromIndex on.
    const from = 3
    const answered: Record<string, unknown> = {}
    for (let i = from; i <= camQs.length; i++) answered[camQs[i - 1].fieldName] = 'x'
    expect(nextQuestionToSend(camQs, from, answered, CAM_GEO)).toEqual({
      index: camQs.length + 1,
      skipped: camQs.slice(from - 1).map((q) => q.fieldName),
    })
  })

  it('Ecuador (all geo labels present) never skips a geo question', () => {
    // neighborhood is question 5 for Ecuador too — but its label is set, so not skipped.
    expect(ecuadorQs[4].fieldName).toBe('neighborhood')
    expect(nextQuestionToSend(ecuadorQs, 5, {}, ECUADOR_GEO)).toEqual({ index: 5, skipped: [] })
  })

  it('a falsy-but-present answered value (0, "", false) does NOT count as answered (only != null)', () => {
    // rule 1 is `answered[f] != null` — 0/""/false are real answers a user could give.
    const qs = camQs
    expect(nextQuestionToSend(qs, 2, { country: '' }, CAM_GEO).skipped).toContain('country')
    expect(nextQuestionToSend(qs, 2, { country: null }, CAM_GEO).skipped).not.toContain('country')
    expect(nextQuestionToSend(qs, 2, {}, CAM_GEO).skipped).not.toContain('country')
  })
})
