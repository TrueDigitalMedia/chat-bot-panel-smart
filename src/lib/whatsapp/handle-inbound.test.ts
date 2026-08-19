import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  upsertLead,
  logConversationMessage,
  wasProviderMessageAlreadyProcessed,
  routeMessage,
  getPendingWaChoices,
  clearPendingWaChoices,
} = vi.hoisted(() => ({
  upsertLead: vi.fn(),
  logConversationMessage: vi.fn(),
  wasProviderMessageAlreadyProcessed: vi.fn(),
  routeMessage: vi.fn(),
  getPendingWaChoices: vi.fn(),
  clearPendingWaChoices: vi.fn(),
}))

vi.mock('@/lib/db/leads', () => ({ upsertLead }))
vi.mock('@/lib/db/conversation-messages', () => ({ logConversationMessage, wasProviderMessageAlreadyProcessed }))
vi.mock('@/lib/conversation/flow-router', () => ({ routeMessage }))
vi.mock('@/lib/whatsapp/pending-choices', () => ({ getPendingWaChoices, clearPendingWaChoices }))

import { processWhatsAppInbound } from './handle-inbound'
import type { ChannelInbound } from '@/types/channel'

function makeInbound(overrides: Partial<ChannelInbound> = {}): ChannelInbound {
  return { channel: 'whatsapp', channelUserId: '50255551234', text: 'hola', ...overrides } as ChannelInbound
}

beforeEach(() => {
  vi.resetAllMocks()
  upsertLead.mockResolvedValue({ id: 'lead-1', channel: 'whatsapp' })
  getPendingWaChoices.mockResolvedValue(null)
  wasProviderMessageAlreadyProcessed.mockResolvedValue(false)
  logConversationMessage.mockResolvedValue(undefined)
  routeMessage.mockResolvedValue(undefined)
})

describe('processWhatsAppInbound — webhook redelivery idempotency', () => {
  it('routes and logs a first-time delivery normally', async () => {
    await processWhatsAppInbound(makeInbound(), { messageId: 'wamid.ABC123' })

    expect(wasProviderMessageAlreadyProcessed).toHaveBeenCalledWith('whatsapp', 'wamid.ABC123')
    expect(routeMessage).toHaveBeenCalledTimes(1)
    expect(logConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: 'wamid.ABC123' }),
    )
  })

  it('skips routing entirely for a redelivery of a message id already processed', async () => {
    wasProviderMessageAlreadyProcessed.mockResolvedValue(true)

    await processWhatsAppInbound(makeInbound(), { messageId: 'wamid.ABC123' })

    expect(upsertLead).not.toHaveBeenCalled()
    expect(routeMessage).not.toHaveBeenCalled()
    expect(logConversationMessage).not.toHaveBeenCalled()
  })

  it('uses the Twilio MessageSid when present instead of messageId', async () => {
    await processWhatsAppInbound(makeInbound(), { messageSid: 'SM123', provider: 'twilio' })

    expect(wasProviderMessageAlreadyProcessed).toHaveBeenCalledWith('whatsapp', 'SM123')
  })

  it('still processes normally when no provider message id is available', async () => {
    await processWhatsAppInbound(makeInbound())

    expect(wasProviderMessageAlreadyProcessed).not.toHaveBeenCalled()
    expect(routeMessage).toHaveBeenCalledTimes(1)
  })
})
