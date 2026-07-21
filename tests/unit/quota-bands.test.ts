import { describe, it, expect } from 'vitest'
import { ageBand, householdBand } from '@/lib/quotas/quota-bands'

describe('ageBand (research.md R3)', () => {
  it('returns null for null/undefined input', () => {
    expect(ageBand(null)).toBeNull()
    expect(ageBand(undefined)).toBeNull()
  })

  it('buckets 34 and below as "Hasta 34"', () => {
    expect(ageBand(18)).toBe('Hasta 34')
    expect(ageBand(34)).toBe('Hasta 34')
  })

  it('buckets the 35/49 boundary correctly', () => {
    expect(ageBand(35)).toBe('35 a 49')
    expect(ageBand(49)).toBe('35 a 49')
  })

  it('buckets 50 and above as "50+"', () => {
    expect(ageBand(50)).toBe('50+')
    expect(ageBand(90)).toBe('50+')
  })
})

describe('householdBand (research.md R3)', () => {
  it('returns null for null/undefined input', () => {
    expect(householdBand(null)).toBeNull()
    expect(householdBand(undefined)).toBeNull()
  })

  it('buckets 1-2 as "1 a 2"', () => {
    expect(householdBand(1)).toBe('1 a 2')
    expect(householdBand(2)).toBe('1 a 2')
  })

  it('buckets the 3/4 range as "3 a 4"', () => {
    expect(householdBand(3)).toBe('3 a 4')
    expect(householdBand(4)).toBe('3 a 4')
  })

  it('buckets 5 and above as "5+"', () => {
    expect(householdBand(5)).toBe('5+')
    expect(householdBand(12)).toBe('5+')
  })
})
