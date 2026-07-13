import { describe, expect, it } from 'vitest'
import { channelRequiresPhonePrompt, normalizePhone } from '@/lib/phone'

describe('normalizePhone', () => {
  it('accepts E.164 with plus', () => {
    expect(normalizePhone('+50255551234')).toBe('+50255551234')
  })

  it('strips spaces and dashes', () => {
    expect(normalizePhone('+502 5555-1234')).toBe('+50255551234')
  })

  it('rejects too short', () => {
    expect(normalizePhone('12345')).toBeNull()
  })
})

describe('channelRequiresPhonePrompt', () => {
  it('requires prompt on telegram and web', () => {
    expect(channelRequiresPhonePrompt('telegram')).toBe(true)
    expect(channelRequiresPhonePrompt('web')).toBe(true)
    expect(channelRequiresPhonePrompt('whatsapp')).toBe(false)
  })
})
