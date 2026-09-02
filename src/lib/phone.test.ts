import { describe, expect, it } from 'vitest'
import { isBsuidChannelUserId, normalizePhone } from './phone'

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
  it('would mangle a BSUID if fed one — hence the isBsuidChannelUserId guard upstream', () => {
    expect(normalizePhone('+DO.929750206851603')).toBe('+929750206851603')
  })
})
