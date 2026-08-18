import { describe, it, expect, vi, beforeEach } from 'vitest'

const logCalls: Array<{
  leadId: string
  direction: string
  channel: string
  contentType?: string
  body: string
  meta?: Record<string, unknown>
}> = []

vi.mock('@/lib/db/conversation-messages', () => ({
  logConversationMessage: vi.fn(async (input: (typeof logCalls)[number]) => {
    logCalls.push(input)
  }),
  // No prior outbound message in any of these tests — dedupeRepeat (send.ts) should
  // treat every send here as the first, not append a repeat nudge.
  getLastOutboundMessage: vi.fn(async () => null),
}))

// Never actually called for channel 'web' — mocked only so importing send.ts doesn't
// pull in real Telegram/WhatsApp SDK clients that need env credentials.
vi.mock('@/lib/telegram/send', () => ({
  sendText: vi.fn(),
  sendVideo: vi.fn(),
  sendInlineKeyboard: vi.fn(),
  sendContactRequest: vi.fn(),
  removeReplyKeyboard: vi.fn(),
  sendLocationRequest: vi.fn(),
}))
vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppText: vi.fn(),
  sendWhatsAppVideo: vi.fn(),
  sendWhatsAppKeyboard: vi.fn(async () => ({ choices: [] })),
}))
vi.mock('@/lib/whatsapp/pending-choices', () => ({
  setPendingWaChoices: vi.fn(),
}))

import {
  sendText,
  sendVideo,
  sendInlineKeyboard,
  sendPhoneRequest,
  confirmPhoneSaved,
  sendLocationRequest,
} from '@/lib/messaging/send'

const WEB_RECIPIENT = { channel: 'web' as const, channelUserId: 'session-abc', id: 'lead-1' }

describe('send.ts — channel "web" no longer throws (spec 012 research.md R6/R7)', () => {
  beforeEach(() => {
    logCalls.length = 0
  })

  it('sendText persists the message instead of throwing', async () => {
    await expect(sendText(WEB_RECIPIENT, 'Hola, bienvenido')).resolves.toBeUndefined()
    expect(logCalls).toContainEqual(
      expect.objectContaining({ leadId: 'lead-1', direction: 'out', channel: 'web', contentType: 'text', body: 'Hola, bienvenido' }),
    )
  })

  it('sendVideo persists the message instead of throwing', async () => {
    await expect(sendVideo(WEB_RECIPIENT, 'https://example.com/v.mp4', 'caption')).resolves.toBeUndefined()
    expect(logCalls).toContainEqual(
      expect.objectContaining({ leadId: 'lead-1', direction: 'out', channel: 'web', contentType: 'video' }),
    )
  })

  it('sendInlineKeyboard persists the buttons in meta instead of throwing', async () => {
    await expect(
      sendInlineKeyboard(WEB_RECIPIENT, '¿Confirmas?', [[{ text: 'Sí', callback_data: 'optin:accept' }]]),
    ).resolves.toBeUndefined()
    const call = logCalls.find((c) => c.contentType === 'keyboard')
    expect(call).toBeTruthy()
    expect(call!.meta).toMatchObject({ buttons: [{ text: 'Sí', callback_data: 'optin:accept' }] })
  })

  it('sendPhoneRequest persists the typed-phone prompt instead of throwing', async () => {
    await expect(sendPhoneRequest(WEB_RECIPIENT)).resolves.toBeUndefined()
    expect(logCalls).toContainEqual(
      expect.objectContaining({ leadId: 'lead-1', direction: 'out', channel: 'web', meta: { type: 'contact_request' } }),
    )
  })

  it('confirmPhoneSaved persists the confirmation instead of throwing', async () => {
    await expect(confirmPhoneSaved(WEB_RECIPIENT, '+50255551234')).resolves.toBeUndefined()
    expect(logCalls).toContainEqual(
      expect.objectContaining({ leadId: 'lead-1', direction: 'out', channel: 'web', contentType: 'text' }),
    )
  })
})

describe('sendLocationRequest — channel "web" (spec 012 US3, research.md R5)', () => {
  beforeEach(() => {
    logCalls.length = 0
  })

  it('logs a location_request prompt instead of throwing', async () => {
    await expect(sendLocationRequest(WEB_RECIPIENT)).resolves.toBeUndefined()
    expect(logCalls).toContainEqual(
      expect.objectContaining({
        leadId: 'lead-1',
        direction: 'out',
        channel: 'web',
        contentType: 'text',
        meta: { type: 'location_request' },
      }),
    )
  })
})
