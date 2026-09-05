import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getLeadByChannelUser, hasOptedOut, transitionLead } = vi.hoisted(() => ({
  getLeadByChannelUser: vi.fn(),
  hasOptedOut: vi.fn().mockReturnValue(false),
  transitionLead: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/db/leads', () => ({ getLeadByChannelUser, hasOptedOut }))
vi.mock('@/lib/state-machine', () => ({ transitionLead }))
vi.mock('@/lib/correlation', () => ({ generateCorrelationId: () => 'corr-1' }))

import { handleTwilioStop } from './handle-twilio-stop'
import { isTwilioOptOutError } from '@/lib/whatsapp/providers/twilio/errors'

const lead = (over = {}) => ({ id: 'lead-1', leadStatus: 'link_sent', statusReason: null, ...over })

beforeEach(() => vi.clearAllMocks())

describe('isTwilioOptOutError', () => {
  it('matches only Twilio code 21610', () => {
    expect(isTwilioOptOutError({ code: 21610 })).toBe(true)
    expect(isTwilioOptOutError({ code: 21211 })).toBe(false)
    expect(isTwilioOptOutError(new Error('boom'))).toBe(false)
    expect(isTwilioOptOutError(null)).toBe(false)
  })
})

describe('handleTwilioStop', () => {
  it('abandons a re-engageable lead with reason twilio_stop', async () => {
    getLeadByChannelUser.mockResolvedValue(lead({ leadStatus: 'link_sent' }))
    await handleTwilioStop('DO.123')
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'abandono', 'twilio_stop', 'corr-1')
  })

  it('routes a post-code lead to code_delivered_not_registered instead of abandono', async () => {
    getLeadByChannelUser.mockResolvedValue(lead({ leadStatus: 'code_delivered_no_response' }))
    await handleTwilioStop('DO.123')
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'code_delivered_not_registered', 'twilio_stop', 'corr-1')
  })

  it('is a no-op for an unknown, already-opted-out, or terminal lead', async () => {
    getLeadByChannelUser.mockResolvedValue(null)
    await handleTwilioStop('x')
    getLeadByChannelUser.mockResolvedValue(lead())
    hasOptedOut.mockReturnValueOnce(true)
    await handleTwilioStop('x')
    getLeadByChannelUser.mockResolvedValue(lead({ leadStatus: 'abandono' }))
    await handleTwilioStop('x')
    expect(transitionLead).not.toHaveBeenCalled()
  })

  it('never throws even if transitionLead rejects', async () => {
    getLeadByChannelUser.mockResolvedValue(lead())
    transitionLead.mockRejectedValueOnce(new Error('db down'))
    await expect(handleTwilioStop('x')).resolves.toBeUndefined()
  })
})
