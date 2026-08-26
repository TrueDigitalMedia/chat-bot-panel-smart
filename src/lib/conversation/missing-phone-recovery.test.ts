import { describe, it, expect, vi, beforeEach } from 'vitest'

const { normalizePhone, sendText, applyPhoneRemediation, requestRegistrationCodeForLead } = vi.hoisted(() => ({
  normalizePhone: vi.fn(),
  sendText: vi.fn(),
  applyPhoneRemediation: vi.fn(),
  requestRegistrationCodeForLead: vi.fn(),
}))

vi.mock('@/lib/phone', () => ({ normalizePhone }))
vi.mock('@/lib/messaging/send', () => ({ sendText }))
vi.mock('@/lib/db/leads', () => ({
  applyPhoneRemediation,
  LINK_SENT_TIMEOUT_REASONS: new Set([
    'tdm_registration_request_timeout',
    'code_request_not_configured',
    'code_request_missing_profile',
  ]),
}))
vi.mock('@/lib/onboarding/request-registration-code', () => ({ requestRegistrationCodeForLead }))

import { isMissingPhoneForRegistration, handleMissingPhoneRecovery } from './missing-phone-recovery'
import type { Lead } from '@/types/lead'

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    channel: 'whatsapp',
    leadStatus: 'link_sent',
    statusReason: null,
    phoneNumber: null,
    ...overrides,
  } as unknown as Lead
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('isMissingPhoneForRegistration', () => {
  it('true for link_sent with no phone', () => {
    expect(isMissingPhoneForRegistration(makeLead({ leadStatus: 'link_sent', phoneNumber: null }))).toBe(true)
  })

  it('true for abandono via a TDM-timeout reason with no phone', () => {
    expect(
      isMissingPhoneForRegistration(
        makeLead({ leadStatus: 'abandono', statusReason: 'tdm_registration_request_timeout', phoneNumber: null }),
      ),
    ).toBe(true)
  })

  it('false once a phone is on file, regardless of status', () => {
    expect(isMissingPhoneForRegistration(makeLead({ leadStatus: 'link_sent', phoneNumber: '+18095551234' }))).toBe(
      false,
    )
  })

  it('false for abandono via an unrelated reason (e.g. a real opt-out)', () => {
    expect(
      isMissingPhoneForRegistration(makeLead({ leadStatus: 'abandono', statusReason: 'user_freetext_opt_out' })),
    ).toBe(false)
  })

  it('false for a non-whatsapp channel — telegram/web are asked for their phone up front already', () => {
    expect(isMissingPhoneForRegistration(makeLead({ channel: 'telegram', leadStatus: 'link_sent' }))).toBe(false)
  })

  it('false for an unrelated status (e.g. still mid-survey)', () => {
    expect(isMissingPhoneForRegistration(makeLead({ leadStatus: 'incomplete' }))).toBe(false)
  })
})

describe('handleMissingPhoneRecovery', () => {
  it('a valid phone is saved, the lead moves to link_sent, and the registration code request is retried', async () => {
    normalizePhone.mockReturnValue('+18095551234')
    const lead = makeLead({ leadStatus: 'abandono', statusReason: 'tdm_registration_request_timeout' })
    const updated = { ...lead, leadStatus: 'link_sent', phoneNumber: '+18095551234' }
    applyPhoneRemediation.mockResolvedValue(updated)

    await handleMissingPhoneRecovery(lead, '+1 809 555 1234', 'corr-1')

    expect(normalizePhone).toHaveBeenCalledWith('+1 809 555 1234')
    expect(applyPhoneRemediation).toHaveBeenCalledWith('lead-1', '+18095551234')
    expect(sendText).toHaveBeenCalledWith(updated, expect.stringContaining('+18095551234'))
    expect(requestRegistrationCodeForLead).toHaveBeenCalledWith(updated, 2, 'corr-1')
  })

  it('an unparseable reply re-prompts instead of applying anything', async () => {
    normalizePhone.mockReturnValue(null)
    const lead = makeLead({ leadStatus: 'link_sent' })

    await handleMissingPhoneRecovery(lead, '¿cuál es mi código?', 'corr-1')

    expect(applyPhoneRemediation).not.toHaveBeenCalled()
    expect(requestRegistrationCodeForLead).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(lead, expect.stringContaining('número de teléfono'))
  })

  it('a bare tap with no text also just re-prompts', async () => {
    const lead = makeLead({ leadStatus: 'link_sent' })

    await handleMissingPhoneRecovery(lead, '', 'corr-1')

    expect(normalizePhone).not.toHaveBeenCalled()
    expect(applyPhoneRemediation).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(lead, expect.stringContaining('número de teléfono'))
  })
})
