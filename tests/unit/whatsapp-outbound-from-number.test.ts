import { describe, it, expect, vi, beforeEach } from 'vitest'

// spec 017 US2 — the from-number is threaded through the Meta provider's single choke point.

const { envMock } = vi.hoisted(() => ({
  envMock: {
    WHATSAPP_PHONE_NUMBER_ID: 'CAM_DEFAULT',
    WHATSAPP_GRAPH_VERSION: 'v21.0',
    WHATSAPP_ACCESS_TOKEN: 'tok',
    WHATSAPP_VERIFY_TOKEN: 'vt',
    WHATSAPP_APP_SECRET: 'sec',
  } as Record<string, string | undefined>,
}))
vi.mock('@/lib/env', () => ({
  env: envMock,
  isMetaWhatsAppConfigured: () => true,
}))

import { graphMessagesUrl } from '@/lib/whatsapp/providers/meta/graph'

describe('graphMessagesUrl', () => {
  it('uses the given phone_number_id', () => {
    expect(graphMessagesUrl('EC_ID')).toBe('https://graph.facebook.com/v21.0/EC_ID/messages')
  })
  it('falls back to WHATSAPP_PHONE_NUMBER_ID when none is given', () => {
    expect(graphMessagesUrl()).toBe('https://graph.facebook.com/v21.0/CAM_DEFAULT/messages')
    expect(graphMessagesUrl(undefined)).toBe('https://graph.facebook.com/v21.0/CAM_DEFAULT/messages')
  })
})

describe('messaging/send — whatsapp branch selects the bound number', () => {
  beforeEach(() => vi.resetModules())

  it('passes lead.whatsappPhoneNumberId to the whatsapp facade; logs fallback when absent', async () => {
    const sendWhatsAppText = vi.fn().mockResolvedValue('mid')
    vi.doMock('@/lib/whatsapp/send', () => ({
      sendWhatsAppText,
      sendWhatsAppVideo: vi.fn(),
      sendWhatsAppKeyboard: vi.fn().mockResolvedValue({ choices: {} }),
      sendWhatsAppTemplateOrKeyboard: vi.fn().mockResolvedValue({ choices: {} }),
      sendWhatsAppTemplateOrText: vi.fn(),
    }))
    vi.doMock('@/lib/telegram/send', () => ({ sendText: vi.fn() }))
    vi.doMock('@/lib/whatsapp/pending-choices', () => ({ setPendingWaChoices: vi.fn() }))
    vi.doMock('@/lib/db/conversation-messages', () => ({
      logConversationMessage: vi.fn(),
      getLastOutboundMessage: vi.fn().mockResolvedValue(null),
      countOutboundSinceLastInbound: vi.fn().mockResolvedValue(0),
    }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { sendText } = await import('@/lib/messaging/send')

    await sendText(
      { channel: 'whatsapp', channelUserId: '5939', whatsappPhoneNumberId: 'EC_ID', id: 'lead-1' } as never,
      'hola',
    )
    expect(sendWhatsAppText).toHaveBeenLastCalledWith('5939', 'hola', 'EC_ID')

    await sendText(
      { channel: 'whatsapp', channelUserId: '5021', id: 'lead-2' } as never,
      'hola CAM',
    )
    expect(sendWhatsAppText).toHaveBeenLastCalledWith('5021', 'hola CAM', undefined)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('whatsapp_from_fallback'))
  })
})
