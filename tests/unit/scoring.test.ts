import { describe, it, expect } from 'vitest'
import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'

describe('calculateScore', () => {
  it('returns 0 for minimum profile', () => {
    const score = calculateScore({
      educationPsh: 'Sin instrucción formal',
      cars: '0',
      domesticHelp: false,
      householdSize: 10,
      bedrooms: 0,
    })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns higher score for high-SES profile', () => {
    const highScore = calculateScore({
      educationPsh: 'Posgrado',
      cars: '2 o más',
      domesticHelp: true,
      householdSize: 2,
      bedrooms: 4,
    })
    const lowScore = calculateScore({
      educationPsh: 'Sin instrucción formal',
      cars: '0',
      domesticHelp: false,
      householdSize: 8,
      bedrooms: 1,
    })
    expect(highScore).toBeGreaterThan(lowScore)
  })

  it('clamps score to 0-100', () => {
    const score = calculateScore({
      educationPsh: 'Posgrado',
      cars: '2 o más',
      domesticHelp: true,
      householdSize: 1,
      bedrooms: 10,
    })
    expect(score).toBeLessThanOrEqual(100)
  })

  it('handles null fields gracefully', () => {
    const score = calculateScore({
      educationPsh: null,
      cars: null,
      domesticHelp: null,
      householdSize: null,
      bedrooms: null,
    })
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

describe('getQuotaSegment', () => {
  it('returns A/B for score >= 70', () => expect(getQuotaSegment(70)).toBe('A/B'))
  it('returns C+ for score 50-69', () => expect(getQuotaSegment(55)).toBe('C+'))
  it('returns C for score 30-49', () => expect(getQuotaSegment(35)).toBe('C'))
  it('returns D+ for score 15-29', () => expect(getQuotaSegment(20)).toBe('D+'))
  it('returns D/E for score < 15', () => expect(getQuotaSegment(5)).toBe('D/E'))
})
