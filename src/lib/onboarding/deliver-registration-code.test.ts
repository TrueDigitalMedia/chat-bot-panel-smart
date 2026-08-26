import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  dbUpdate,
  transitionLead,
  sendVideo,
  sendInlineKeyboard,
  sendTemplateOrKeyboard,
  sendTemplateOrText,
  scheduleFreezeRegistration,
  getWhatsAppProvider,
  getApprovedTemplate,
} = vi.hoisted(() => ({
  dbUpdate: vi.fn(),
  transitionLead: vi.fn(),
  sendVideo: vi.fn(),
  sendInlineKeyboard: vi.fn(),
  sendTemplateOrKeyboard: vi.fn(),
  sendTemplateOrText: vi.fn(),
  scheduleFreezeRegistration: vi.fn(),
  getWhatsAppProvider: vi.fn(),
  getApprovedTemplate: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  db: { update: dbUpdate },
}))
vi.mock('@/lib/state-machine', () => ({ transitionLead }))
vi.mock('@/lib/messaging/send', () => ({ sendVideo, sendInlineKeyboard, sendTemplateOrKeyboard, sendTemplateOrText }))
vi.mock('@/lib/scheduler/registration-freeze', () => ({ scheduleFreezeRegistration }))
vi.mock('@/lib/whatsapp/provider', () => ({ getWhatsAppProvider }))
vi.mock('@/lib/whatsapp/providers/twilio/templates', () => ({ getApprovedTemplate }))
vi.mock('./registration-choice', () => ({ REGISTER_CALLBACK_YES: 'register:yes', REGISTER_CALLBACK_NO: 'register:no' }))

import { deliverRegistrationCode } from './deliver-registration-code'
import type { Lead } from '@/types/lead'

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    channel: 'whatsapp',
    channelUserId: '18095551234',
    ...overrides,
  } as unknown as Lead
}

beforeEach(() => {
  vi.resetAllMocks()
  dbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) })
  transitionLead.mockResolvedValue(undefined)
  scheduleFreezeRegistration.mockResolvedValue(undefined)
  getWhatsAppProvider.mockReturnValue('twilio')
  getApprovedTemplate.mockResolvedValue({ contentSid: 'HX123' })
})

describe('deliverRegistrationCode — OTP template vs. plain combined send', () => {
  it('uses the split OTP + instructions templates for a normal phone-number recipient', async () => {
    const lead = makeLead({ channelUserId: '18095551234' })

    await deliverRegistrationCode(lead, '1234567890', { reason: 'test', phase: 2 }, 'corr-1')

    expect(sendTemplateOrText).toHaveBeenCalled()
    expect(sendTemplateOrKeyboard).toHaveBeenCalled()
    expect(sendInlineKeyboard).not.toHaveBeenCalled()
  })

  it('falls back to the single combined message for a BSUID recipient — Meta rejects the OTP template for those', async () => {
    const lead = makeLead({ channelUserId: 'CO.1103030042050684' })

    await deliverRegistrationCode(lead, '5022028669', { reason: 'test', phase: 2 }, 'corr-1')

    expect(sendTemplateOrText).not.toHaveBeenCalled()
    expect(sendTemplateOrKeyboard).not.toHaveBeenCalled()
    expect(sendInlineKeyboard).toHaveBeenCalledWith(
      lead,
      expect.stringContaining('5022028669'),
      expect.any(Array),
    )
  })

  it('mock codes always use the plain combined send regardless of recipient shape', async () => {
    const lead = makeLead({ channelUserId: '18095551234' })

    await deliverRegistrationCode(lead, 'MOCK-ABCD1234', { reason: 'test', phase: 2, mock: true }, 'corr-1')

    expect(sendTemplateOrText).not.toHaveBeenCalled()
    expect(sendInlineKeyboard).toHaveBeenCalled()
  })
})
