import { describe, it, expect } from 'vitest'
import { calculateScore, getQuotaSegment, NIPSH_SCORES } from '@/lib/scoring/socioeconomic'
import { SURVEY_QUESTIONS } from '@/lib/conversation/survey-questions'

describe('calculateScore — official Kantar SCL-CAM formula', () => {
  it('matches the manual calculation for a known high-SES profile', () => {
    // NiPSH=1000 (Universidad Completa), HACI=(10*4)/2=20 -> 250 pts, AUTO=1000, SD=0
    // (45*1000 + 18*250 + 28*1000 + 9*0) / 100 = 775
    const score = calculateScore({
      educationPsh: 'Universidad Completa',
      cars: '2 o más',
      domesticHelp: false,
      householdSize: 4,
      bedrooms: 2,
    })
    expect(score).toBe(775)
    expect(getQuotaSegment(score)).toBe('Nivel 1')
  })

  it('matches the manual calculation for a known low-SES profile', () => {
    // NiPSH=0 (No alfabetizado), HACI=99 (no dormitorios exclusivos) -> 0 pts, AUTO=0, SD=0
    const score = calculateScore({
      educationPsh: 'No alfabetizado',
      cars: '0',
      domesticHelp: false,
      householdSize: 6,
      bedrooms: 0,
    })
    expect(score).toBe(0)
    expect(getQuotaSegment(score)).toBe('Nivel 4')
  })

  it('treats a household with no exclusive bedrooms as HACI=99 (0 points) regardless of size', () => {
    const scoreSmallHousehold = calculateScore({
      educationPsh: 'Bachillerato Completo',
      cars: '1',
      domesticHelp: false,
      householdSize: 1,
      bedrooms: 0,
    })
    const scoreLargeHousehold = calculateScore({
      educationPsh: 'Bachillerato Completo',
      cars: '1',
      domesticHelp: false,
      householdSize: 10,
      bedrooms: 0,
    })
    expect(scoreSmallHousehold).toBe(scoreLargeHousehold)
  })

  it('gives 0 points to all four base NiPSH levels (No alfabetizado through Primaria Completa)', () => {
    const base = {
      cars: '0',
      domesticHelp: false,
      householdSize: 4,
      bedrooms: 4, // HACI = 10 -> 500 pts, kept constant across cases
    }
    const levels = [
      'No alfabetizado',
      'Alfabetizado pero no en escuela normal',
      'Primaria Incompleta',
      'Primaria Completa',
    ]
    const scores = levels.map((educationPsh) => calculateScore({ ...base, educationPsh }))
    expect(new Set(scores).size).toBe(1)
  })

  it('gives 1000 points to all three top NiPSH levels (Universidad Completa and above)', () => {
    const base = { cars: '0', domesticHelp: false, householdSize: 4, bedrooms: 4 }
    const levels = ['Universidad Completa', 'Pos Grado Incompleto', 'Pos Grado Completo']
    const scores = levels.map((educationPsh) => calculateScore({ ...base, educationPsh }))
    expect(new Set(scores).size).toBe(1)
  })

  it('handles null fields gracefully, treating them as the lowest-scoring option', () => {
    const score = calculateScore({
      educationPsh: null,
      cars: null,
      domesticHelp: null,
      householdSize: null,
      bedrooms: null,
    })
    expect(score).toBe(0)
  })

  it('produces a higher score for a strictly higher-SES profile', () => {
    const highScore = calculateScore({
      educationPsh: 'Pos Grado Completo',
      cars: '2 o más',
      domesticHelp: true,
      householdSize: 2,
      bedrooms: 4,
    })
    const lowScore = calculateScore({
      educationPsh: 'No alfabetizado',
      cars: '0',
      domesticHelp: false,
      householdSize: 8,
      bedrooms: 1,
    })
    expect(highScore).toBeGreaterThan(lowScore)
  })
})

describe('educationPsh survey options stay in sync with the NiPSH table', () => {
  it('every educationPsh button value has a matching NiPSH_SCORES entry', () => {
    const question = SURVEY_QUESTIONS.find((q) => q.fieldName === 'educationPsh')
    expect(question?.buttons).toBeDefined()

    const values = question!.buttons!.flat().map((b) => b.callback_data.split(':').slice(1).join(':'))
    expect(values).toHaveLength(12)

    for (const value of values) {
      expect(NIPSH_SCORES).toHaveProperty(value)
    }
  })
})

describe('getQuotaSegment — official Nivel 1-4 thresholds', () => {
  it('classifies >= 540 as Nivel 1', () => {
    expect(getQuotaSegment(540)).toBe('Nivel 1')
    expect(getQuotaSegment(1000)).toBe('Nivel 1')
  })

  it('classifies the boundary just below 540 as Nivel 2', () => {
    expect(getQuotaSegment(539)).toBe('Nivel 2')
  })

  it('classifies > 325 and < 540 as Nivel 2', () => {
    expect(getQuotaSegment(326)).toBe('Nivel 2')
    expect(getQuotaSegment(400)).toBe('Nivel 2')
  })

  it('classifies exactly 325 as Nivel 3 (not Nivel 2)', () => {
    expect(getQuotaSegment(325)).toBe('Nivel 3')
  })

  it('classifies > 180 and <= 325 as Nivel 3', () => {
    expect(getQuotaSegment(181)).toBe('Nivel 3')
    expect(getQuotaSegment(250)).toBe('Nivel 3')
  })

  it('classifies exactly 180 as Nivel 4 (not Nivel 3)', () => {
    expect(getQuotaSegment(180)).toBe('Nivel 4')
  })

  it('classifies <= 180 as Nivel 4', () => {
    expect(getQuotaSegment(0)).toBe('Nivel 4')
    expect(getQuotaSegment(179)).toBe('Nivel 4')
  })

  it('never returns a México-style segment label for any score in range', () => {
    const mexicoLabels = new Set(['A/B', 'C+', 'C', 'D+', 'D/E'])
    for (let score = 0; score <= 1000; score += 10) {
      expect(mexicoLabels.has(getQuotaSegment(score))).toBe(false)
    }
  })
})
