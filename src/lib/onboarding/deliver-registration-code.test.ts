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
    phoneNumber: '18095551234',
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

describe('deliverRegistrationCode — OTP template addressing', () => {
  it('addresses the OTP template by channelUserId when it already IS the phone number', async () => {
    const lead = makeLead({ channelUserId: '18095551234', phoneNumber: '18095551234' })

    await deliverRegistrationCode(lead, '1234567890', { reason: 'test', phase: 2 }, 'corr-1')

    expect(sendTemplateOrText).toHaveBeenCalledWith(
      expect.objectContaining({ channelUserId: '18095551234' }),
      'registration_code_otp',
      expect.any(String),
      expect.any(Object),
    )
  })

  it('addresses the OTP template by phoneNumber (not channelUserId) for a BSUID lead — Meta requires a real number for copy-code Authentication templates', async () => {
    const lead = makeLead({ channelUserId: 'CO.1103030042050684', phoneNumber: '+573214890561' })

    await deliverRegistrationCode(lead, '5022028669', { reason: 'test', phase: 2 }, 'corr-1')

    expect(sendTemplateOrText).toHaveBeenCalledWith(
      expect.objectContaining({ channelUserId: '+573214890561', id: 'lead-1' }),
      'registration_code_otp',
      expect.any(String),
      expect.any(Object),
    )
  })

  it('the Utility instructions template still routes via the BSUID channelUserId, not the phone — Meta allows that for non-Authentication templates', async () => {
    const lead = makeLead({ channelUserId: 'CO.1103030042050684', phoneNumber: '+573214890561' })

    await deliverRegistrationCode(lead, '5022028669', { reason: 'test', phase: 2 }, 'corr-1')

    expect(sendTemplateOrKeyboard).toHaveBeenCalledWith(
      expect.objectContaining({ channelUserId: 'CO.1103030042050684' }),
      'registration_instructions_confirm',
      expect.any(String),
      expect.any(Array),
    )
  })

  it('falls back to the lead itself if phoneNumber is somehow still missing (defensive, shouldn\'t happen post-fix)', async () => {
    const lead = makeLead({ channelUserId: 'CO.1103030042050684', phoneNumber: null })

    await deliverRegistrationCode(lead, '5022028669', { reason: 'test', phase: 2 }, 'corr-1')

    expect(sendTemplateOrText).toHaveBeenCalledWith(
      expect.objectContaining({ channelUserId: 'CO.1103030042050684' }),
      'registration_code_otp',
      expect.any(String),
      expect.any(Object),
    )
  })

  it('mock codes always use the plain combined send, unaffected by phone/BSUID addressing', async () => {
    const lead = makeLead({ channelUserId: '18095551234' })

    await deliverRegistrationCode(lead, 'MOCK-ABCD1234', { reason: 'test', phase: 2, mock: true }, 'corr-1')

    expect(sendTemplateOrText).not.toHaveBeenCalled()
    expect(sendInlineKeyboard).toHaveBeenCalled()
  })
})
