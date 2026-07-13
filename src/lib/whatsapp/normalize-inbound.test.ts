import { describe, expect, it } from 'vitest'
import { stripWhatsAppAddress, normalizeTwilioInbound } from '@/lib/whatsapp/normalize-inbound'
import { buildNumberedChoices } from '@/lib/whatsapp/buttons'

describe('whatsapp normalize-inbound', () => {
  it('strips whatsapp: prefix', () => {
    expect(stripWhatsAppAddress('whatsapp:+50255551234')).toBe('+50255551234')
  })

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
