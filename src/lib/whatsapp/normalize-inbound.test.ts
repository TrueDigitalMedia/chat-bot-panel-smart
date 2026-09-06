import { describe, expect, it } from 'vitest'
import {
  stripWhatsAppAddress,
  normalizeTwilioInbound,
  normalizeMetaInbound,
  extractMetaMessages,
} from '@/lib/whatsapp/normalize-inbound'
import { buildNumberedChoices } from '@/lib/whatsapp/buttons'
import { toE164, toMetaRecipient } from '@/lib/whatsapp/phone'

describe('whatsapp phone', () => {
  it('strips whatsapp: prefix and adds +', () => {
    expect(stripWhatsAppAddress('whatsapp:+50255551234')).toBe('+50255551234')
    expect(stripWhatsAppAddress('whatsapp:50255551234')).toBe('+50255551234')
  })

  it('normalizes Meta digits to E.164 / Graph to', () => {
    expect(toE164('50255551234')).toBe('+50255551234')
    expect(toMetaRecipient('+50255551234')).toBe('50255551234')
  })
})

describe('whatsapp normalize-inbound twilio', () => {
  it('maps numbered pending choice to callbackData', () => {
    const inbound = normalizeTwilioInbound(
      { From: 'whatsapp:+50255551234', Body: '1', MessageSid: 'SM1' },
      { '1': 'd1:accept', '2': 'd1:decline' },
    )
    expect(inbound.channel).toBe('whatsapp')
    expect(inbound.channelUserId).toBe('+50255551234')
    expect(inbound.callbackData).toBe('d1:accept')
  })

  it('maps location fields', () => {
    const inbound = normalizeTwilioInbound({
      From: 'whatsapp:+50255551234',
      Body: '',
      Latitude: '14.63',
      Longitude: '-90.60',
      MessageSid: 'SM2',
    })
    expect(inbound.location).toEqual({ latitude: 14.63, longitude: -90.6 })
  })

  it('spec 017 — carries the business number the user messaged (whatsappPhoneNumberId)', () => {
    const inbound = normalizeTwilioInbound(
      { From: 'whatsapp:+593999', To: 'whatsapp:+593111', Body: 'hola', MessageSid: 'SM3' },
      null,
      '+593111',
    )
    expect(inbound.channelUserId).toBe('+593999')
    expect(inbound.whatsappPhoneNumberId).toBe('+593111')
  })

  it('spec 017 — whatsappPhoneNumberId is undefined when no To id is passed', () => {
    const inbound = normalizeTwilioInbound({ From: 'whatsapp:+593999', Body: 'x', MessageSid: 'SM4' })
    expect(inbound.whatsappPhoneNumberId).toBeUndefined()
  })
})

describe('whatsapp normalize-inbound meta', () => {
  it('maps button_reply to callbackData', () => {
    const inbound = normalizeMetaInbound({
      from: '50255551234',
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: { id: 'd1:accept', title: 'Sí' },
      },
    })
    expect(inbound?.channelUserId).toBe('+50255551234')
    expect(inbound?.callbackData).toBe('d1:accept')
    expect(inbound?.text).toBe('')
  })

  it('maps text + pending numbered choice', () => {
    const inbound = normalizeMetaInbound(
      { from: '50255551234', type: 'text', text: { body: '2' } },
      { '1': 'd3:yes', '2': 'd3:no' },
    )
    expect(inbound?.callbackData).toBe('d3:no')
  })

  it('maps location', () => {
    const inbound = normalizeMetaInbound({
      from: '50255551234',
      type: 'location',
      location: { latitude: 14.63, longitude: -90.6 },
    })
    expect(inbound?.location).toEqual({ latitude: 14.63, longitude: -90.6 })
  })

  it('spec 017 — threads the business number (value.metadata.phone_number_id) through', () => {
    const envelopes = extractMetaMessages({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'EC_ID', display_phone_number: '+593 9 000' },
                messages: [{ from: '5939999', type: 'text', text: { body: 'hola' } }],
              },
            },
          ],
        },
      ],
    })
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].phoneNumberId).toBe('EC_ID')
    expect(envelopes[0].displayPhoneNumber).toBe('+593 9 000')

    const inbound = normalizeMetaInbound(envelopes[0].message, null, envelopes[0].phoneNumberId)
    expect(inbound?.whatsappPhoneNumberId).toBe('EC_ID')
  })

  it('spec 017 — phoneNumberId is undefined when the payload has no metadata', () => {
    const envelopes = extractMetaMessages({
      entry: [{ changes: [{ value: { messages: [{ from: '5021', type: 'text', text: { body: 'x' } }] } }] }],
    })
    expect(envelopes[0].phoneNumberId).toBeUndefined()
    expect(normalizeMetaInbound(envelopes[0].message, null, undefined)?.whatsappPhoneNumberId).toBeUndefined()
  })
})

describe('whatsapp buttons', () => {
  it('builds numbered choices', () => {
    const { bodySuffix, choices } = buildNumberedChoices([
      [
        { text: 'Sí', callback_data: 'd3:yes' },
        { text: 'No', callback_data: 'd3:no' },
      ],
    ])
    expect(choices['1']).toBe('d3:yes')
    expect(choices['sí']).toBe('d3:yes')
    expect(bodySuffix).toContain('1) Sí')
    expect(bodySuffix).toContain('2) No')
  })
})
