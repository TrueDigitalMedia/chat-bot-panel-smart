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

  it('rejects a WhatsApp Business-Scoped User ID (BSUID, format "CC.alphanumeric") — too many digits once stripped', () => {
    // Real value Twilio sends instead of a phone number once a WhatsApp user has adopted
    // Meta's username/privacy feature (rolling out since ~April 2026).
    expect(normalizePhone('DO.1393047009463368')).toBeNull()
  })
})

describe('channelRequiresPhonePrompt', () => {
  it('requires prompt on telegram, web, and whatsapp', () => {
    expect(channelRequiresPhonePrompt('telegram')).toBe(true)
    expect(channelRequiresPhonePrompt('web')).toBe(true)
    // WhatsApp is included so a lead whose auto-derived phone (from channelUserId) failed
    // — a BSUID instead of a real number — still gets asked, instead of silently sailing
    // through the rest of the survey with phoneNumber stuck null and only failing much
    // later, at TDM registration ("Campos requeridos faltantes: telefono").
    expect(channelRequiresPhonePrompt('whatsapp')).toBe(true)
  })
})
