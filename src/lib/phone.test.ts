import { describe, expect, it } from 'vitest'
import { isBsuidChannelUserId, isValidRegistrationPhone, normalizePhone } from './phone'

describe('isBsuidChannelUserId', () => {
  it('flags Meta Business-Scoped User IDs', () => {
    expect(isBsuidChannelUserId('DO.929750206851603')).toBe(true)
    expect(isBsuidChannelUserId('US.abc123')).toBe(true)
  })

  it('accepts real E.164 ids (with or without +)', () => {
    expect(isBsuidChannelUserId('18095551234')).toBe(false)
    expect(isBsuidChannelUserId('+18095551234')).toBe(false)
  })
})

describe('normalizePhone regression: a BSUID must never look like a phone', () => {
  it('rejects a BSUID digit-string fed in by mistake (15+ digits exceeds the cap)', () => {
    expect(normalizePhone('+DO.929750206851603')).toBeNull()
  })

  it('still accepts a real long-ish number within the 14-digit cap', () => {
    expect(normalizePhone('+50412345678')).toBe('+50412345678')
  })
})

describe('isValidRegistrationPhone', () => {
  it('accepts a real E.164 number', () => {
    expect(isValidRegistrationPhone('+18095551234')).toBe(true)
  })

  it('rejects a null, a BSUID, and a BSUID-derived fake', () => {
    expect(isValidRegistrationPhone(null)).toBe(false)
    expect(isValidRegistrationPhone('DO.929750206851603')).toBe(false)
    expect(isValidRegistrationPhone('+929750206851603')).toBe(false) // 15 digits, the pre-fix fake
  })
})
