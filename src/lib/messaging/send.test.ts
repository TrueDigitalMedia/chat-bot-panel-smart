import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  telegramSendText,
  telegramSendContactRequest,
  whatsappSendText,
  getLastOutboundMessage,
  logConversationMessage,
  countOutboundSinceLastInbound,
} = vi.hoisted(() => ({
  telegramSendText: vi.fn(),
  telegramSendContactRequest: vi.fn(),
  whatsappSendText: vi.fn(),
  getLastOutboundMessage: vi.fn(),
  logConversationMessage: vi.fn(),
  countOutboundSinceLastInbound: vi.fn(),
}))

vi.mock('@/lib/telegram/send', () => ({ sendText: telegramSendText, sendContactRequest: telegramSendContactRequest }))
vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsAppText: whatsappSendText }))
vi.mock('@/lib/whatsapp/pending-choices', () => ({ setPendingWaChoices: vi.fn() }))
vi.mock('@/lib/db/conversation-messages', () => ({
  getLastOutboundMessage,
  logConversationMessage,
  countOutboundSinceLastInbound,
}))

import { sendText, sendPhoneRequest } from './send'
import type { ChannelRecipient } from '@/types/channel'

function makeRecipient(overrides: Partial<ChannelRecipient> = {}): ChannelRecipient & { id: string } {
  return {
    id: 'lead-1',
    channel: 'telegram',
    channelUserId: '123',
    ...overrides,
  } as unknown as ChannelRecipient & { id: string }
}

beforeEach(() => {
  vi.resetAllMocks()
  telegramSendText.mockResolvedValue(undefined)
  telegramSendContactRequest.mockResolvedValue(undefined)
  whatsappSendText.mockResolvedValue(undefined)
  logConversationMessage.mockResolvedValue(undefined)
  countOutboundSinceLastInbound.mockResolvedValue(0)
})

describe('sendText — never repeats the same message verbatim', () => {
  it('sends the plain text unmodified the first time', async () => {
    getLastOutboundMessage.mockResolvedValue(null)
    const to = makeRecipient()

    await sendText(to, 'Aún estamos en el paso de registro. Confirma con un botón:')

    expect(telegramSendText).toHaveBeenCalledWith(
      BigInt(123),
      'Aún estamos en el paso de registro. Confirma con un botón:',
    )
    expect(logConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Aún estamos en el paso de registro. Confirma con un botón:',
        meta: { dedupeBase: 'Aún estamos en el paso de registro. Confirma con un botón:', dedupeIndex: 0 },
      }),
    )
  })

  it('appends a nudge instead of repeating the exact same text a 2nd consecutive time', async () => {
    getLastOutboundMessage.mockResolvedValue({
      body: 'Aún estamos en el paso de registro. Confirma con un botón:',
      meta: { dedupeBase: 'Aún estamos en el paso de registro. Confirma con un botón:', dedupeIndex: 0 },
    })
    const to = makeRecipient()

    await sendText(to, 'Aún estamos en el paso de registro. Confirma con un botón:')

    const sentText = telegramSendText.mock.calls[0][1] as string
    expect(sentText).not.toBe('Aún estamos en el paso de registro. Confirma con un botón:')
    expect(sentText.startsWith('Aún estamos en el paso de registro. Confirma con un botón:')).toBe(true)
    expect(logConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { dedupeBase: 'Aún estamos en el paso de registro. Confirma con un botón:', dedupeIndex: 1 },
      }),
    )
  })

  it('keeps varying (not stuck on one nudge) across further consecutive repeats', async () => {
    getLastOutboundMessage.mockResolvedValue({
      body: expect.anything(),
      meta: { dedupeBase: 'msg', dedupeIndex: 1 },
    })
    const to = makeRecipient()

    await sendText(to, 'msg')

    const sentText = telegramSendText.mock.calls[0][1] as string
    expect(sentText).not.toBe('msg')
    const [, secondMeta] = [null, logConversationMessage.mock.calls[0][0].meta]
    expect(secondMeta).toEqual({ dedupeBase: 'msg', dedupeIndex: 2 })
  })

  it('does not vary when the new text differs from the last message sent', async () => {
    getLastOutboundMessage.mockResolvedValue({
      body: 'Pregunta anterior',
      meta: { dedupeBase: 'Pregunta anterior', dedupeIndex: 2 },
    })
    const to = makeRecipient()

    await sendText(to, 'Pregunta distinta')

    expect(telegramSendText).toHaveBeenCalledWith(BigInt(123), 'Pregunta distinta')
    expect(logConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { dedupeBase: 'Pregunta distinta', dedupeIndex: 0 } }),
    )
  })

  it('circuit breaker: stops sending entirely once the same text would repeat a 4th consecutive time', async () => {
    getLastOutboundMessage.mockResolvedValue({
      body: expect.anything(),
      meta: { dedupeBase: 'msg', dedupeIndex: 2 },
    })
    const to = makeRecipient()

    await sendText(to, 'msg')

    expect(telegramSendText).not.toHaveBeenCalled()
    expect(logConversationMessage).not.toHaveBeenCalled()
  })

  it('suppresses any send once the outbound-without-reply ceiling is hit, even with brand-new text', async () => {
    getLastOutboundMessage.mockResolvedValue(null)
    countOutboundSinceLastInbound.mockResolvedValue(7)
    const to = makeRecipient()

    await sendText(to, 'un mensaje totalmente nuevo')

    expect(telegramSendText).not.toHaveBeenCalled()
    expect(logConversationMessage).not.toHaveBeenCalled()
  })

  it('skips the dedupe lookup entirely when the recipient has no lead id', async () => {
    const to = { channel: 'telegram', channelUserId: '123' } as unknown as ChannelRecipient

    await sendText(to, 'hola')

    expect(getLastOutboundMessage).not.toHaveBeenCalled()
    expect(telegramSendText).toHaveBeenCalledWith(BigInt(123), 'hola')
  })
})

describe('sendPhoneRequest', () => {
  it('actually sends the WhatsApp user a text prompt — regression test: this used to silently return with no message at all', async () => {
    const to = makeRecipient({ channel: 'whatsapp', channelUserId: 'DO.1393047009463368' })

    await sendPhoneRequest(to)

    expect(whatsappSendText).toHaveBeenCalledWith(
      'DO.1393047009463368',
      expect.stringContaining('número de teléfono'),
    )
    expect(logConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'keyboard', meta: expect.objectContaining({ type: 'contact_request' }) }),
    )
  })

  it('uses the native contact-share prompt for telegram', async () => {
    const to = makeRecipient({ channel: 'telegram' })

    await sendPhoneRequest(to)

    expect(telegramSendContactRequest).toHaveBeenCalledWith(BigInt(123), expect.stringContaining('Compartir mi número'))
  })
})
