import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const {
  dbMock,
  verify,
  transitionLead,
  requestRegistrationCodeForLead,
  sendText,
  sendTemplateOrKeyboard,
  scheduleJob,
  getNextMessageVariant,
  countOutboundSinceLastInbound,
} = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), update: vi.fn() },
  verify: vi.fn(),
  transitionLead: vi.fn(),
  requestRegistrationCodeForLead: vi.fn(),
  sendText: vi.fn(),
  sendTemplateOrKeyboard: vi.fn(),
  scheduleJob: vi.fn(),
  getNextMessageVariant: vi.fn(),
  countOutboundSinceLastInbound: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/env', () => ({
  env: { QSTASH_CURRENT_SIGNING_KEY: 'k1', QSTASH_NEXT_SIGNING_KEY: 'k2' },
}))
vi.mock('@upstash/qstash', () => ({
  Receiver: vi.fn().mockImplementation(() => ({ verify: (...args: unknown[]) => verify(...args) })),
}))
vi.mock('@/lib/state-machine', () => ({ transitionLead: (...args: unknown[]) => transitionLead(...args) }))
vi.mock('@/lib/onboarding/request-registration-code', () => ({
  requestRegistrationCodeForLead: (...args: unknown[]) => requestRegistrationCodeForLead(...args),
}))
vi.mock('@/lib/messaging/send', () => ({
  sendText: (...args: unknown[]) => sendText(...args),
  sendTemplateOrKeyboard: (...args: unknown[]) => sendTemplateOrKeyboard(...args),
}))
vi.mock('@/lib/conversation/reengage-choice', () => ({
  REENGAGE_CALLBACK_CONTINUE: 'reengage:continue',
  REENGAGE_CALLBACK_STOP: 'reengage:stop',
}))
vi.mock('@/lib/scheduler/re-engagement', () => ({ scheduleJob: (...args: unknown[]) => scheduleJob(...args) }))
vi.mock('@/lib/scheduler/messages', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scheduler/messages')>('@/lib/scheduler/messages')
  return { ...actual, getNextMessageVariant: (...args: unknown[]) => getNextMessageVariant(...args) }
})
vi.mock('@/lib/db/conversation-messages', () => ({
  countOutboundSinceLastInbound: (...args: unknown[]) => countOutboundSinceLastInbound(...args),
}))
vi.mock('@/lib/correlation', () => ({ generateCorrelationId: () => 'corr-1' }))

import { POST } from './route'
import type { JobPayload } from '@/lib/scheduler/re-engagement'

function fakeRequest(payload: JobPayload): NextRequest {
  return {
    text: async () => JSON.stringify(payload),
    headers: { get: () => 'sig' },
  } as unknown as NextRequest
}

/** Chainable fake matching `db.select().from(X).where(Y)`. */
function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) }
}

/** Controls what `claimSchedule`'s `.returning()` resolves to — non-empty means "claimed". */
let claimResult: Array<{ id: string }> = [{ id: 'sched-1' }]

function updateChain(captured: Record<string, unknown>[]) {
  return {
    set: (v: Record<string, unknown>) => {
      captured.push(v)
      return {
        where: () => {
          const result = Promise.resolve(undefined) as Promise<undefined> & { returning?: () => Promise<Array<{ id: string }>> }
          result.returning = () => Promise.resolve(claimResult)
          return result
        },
      }
    },
  }
}

const BASE_LEAD = {
  id: 'lead-1',
  leadStatus: 'incomplete',
  currentPhase: 1,
  reEngagementConsentAccepted: true,
  lastActivityAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  reEngagementCount: 0,
}

beforeEach(() => {
  vi.resetAllMocks()
  verify.mockResolvedValue(true)
  countOutboundSinceLastInbound.mockResolvedValue(0)
  claimResult = [{ id: 'sched-1' }]
  const updateCaptured: Record<string, unknown>[] = []
  dbMock.update.mockReturnValue(updateChain(updateCaptured))
})

describe('POST /api/jobs/re-engage', () => {
  it('rejects an invalid QStash signature before touching the db', async () => {
    verify.mockResolvedValue(false)

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))

    expect(res.status).toBe(403)
    expect(dbMock.select).not.toHaveBeenCalled()
  })

  it('skips a duplicate QStash delivery of the same job instead of re-sending', async () => {
    dbMock.select.mockReturnValue(selectChain([BASE_LEAD]))
    claimResult = [] // another delivery of this same job already claimed it

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_duplicate_delivery')
    expect(sendText).not.toHaveBeenCalled()
    expect(transitionLead).not.toHaveBeenCalled()
    expect(scheduleJob).not.toHaveBeenCalled()
  })

  it('re-engage: skips with skipped_terminal and does not send when the lead already reached a terminal status', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'not_qualified' }]))

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_terminal')
    expect(sendText).not.toHaveBeenCalled()
  })

  it('re-engage: skips with skipped_declined and does not send when the lead already declined registration', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'code_delivered_not_registered' }]))

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_declined')
    expect(sendText).not.toHaveBeenCalled()
    expect(sendTemplateOrKeyboard).not.toHaveBeenCalled()
  })

  it('re-engage: skips with skipped_declined and does not send when a stale job outlives the inactivity freeze', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'code_delivered_no_response' }]))

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 2, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_declined')
    expect(sendText).not.toHaveBeenCalled()
    expect(sendTemplateOrKeyboard).not.toHaveBeenCalled()
  })

  it('re-engage: skips with skipped_24h_window when the lead has been idle past the WhatsApp session window', async () => {
    dbMock.select.mockReturnValue(
      selectChain([{ ...BASE_LEAD, lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }]),
    )

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_24h_window')
    expect(sendTemplateOrKeyboard).not.toHaveBeenCalled()
  })

  it('re-engage: skips without consent', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, reEngagementConsentAccepted: false }]))

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_no_consent')
    expect(sendText).not.toHaveBeenCalled()
  })

  it('re-engage: skips when the lead has been active in the last 5 minutes', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, lastActivityAt: new Date().toISOString() }]))

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_already_active')
    expect(sendText).not.toHaveBeenCalled()
  })

  it('re-engage: resolves the message pool from the lead\'s current status (link_sent → phase2 pool) and escalates under the fresh currentPhase', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'link_sent', currentPhase: 2 }]))
    getNextMessageVariant.mockResolvedValue({ text: '¿Ya descargaste la app?', variantOrder: 1 })

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(getNextMessageVariant).toHaveBeenCalledWith('lead-1', 1, 'phase2_link_reminder')
    expect(sendTemplateOrKeyboard).toHaveBeenCalledWith(
      expect.anything(),
      'phase2_link_reminder_a1_v1',
      '¿Ya descargaste la app?',
      [
        [
          { text: '✅ Sí, quiero continuar', callback_data: 'reengage:continue' },
          { text: '❌ No, gracias', callback_data: 'reengage:stop' },
        ],
      ],
    )
    // Escalates using the freshly-read currentPhase (2), not payload.phase (1).
    expect(scheduleJob).toHaveBeenCalledWith('lead-1', 2, 2, expect.any(Number), 're-engage')
    expect(body.outcome).toBe('sent')
  })

  it('re-engage: schedules a re_engagement_timeout instead of abandoning synchronously after the final attempt', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, currentPhase: 1 }]))
    getNextMessageVariant.mockResolvedValue({ text: 'mensaje', variantOrder: 1 })

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 3, action: 're-engage' }))
    const body = await res.json()

    // Abandoning here, in the same request that just sent the final nudge's own
    // Continue/Stop buttons, would make those buttons impossible to ever act on —
    // see the re_engagement_timeout tests below for the delayed give-up instead.
    expect(transitionLead).not.toHaveBeenCalled()
    expect(scheduleJob).toHaveBeenCalledWith('lead-1', 1, 96, expect.any(Number), 're_engagement_timeout')
    expect(body.outcome).toBe('sent_final_awaiting_response')
  })

  it('re_engagement_timeout: abandons the lead when it never responded to the final nudge', async () => {
    const deliveredAt = new Date(Date.now() - 60 * 60 * 1000) // 1h ago
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...BASE_LEAD, lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }]))
      .mockReturnValueOnce(selectChain([{ deliveredAt }]))

    const res = await POST(
      fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 96, action: 're_engagement_timeout' }),
    )
    const body = await res.json()

    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'abandono', 're_engagement_exhausted', 'corr-1')
    expect(body.outcome).toBe('marked_abandono')
  })

  it('re_engagement_timeout: skips a lead already terminal (e.g. explicitly declined the final nudge)', async () => {
    dbMock.select.mockReturnValueOnce(selectChain([{ ...BASE_LEAD, leadStatus: 'abandono' }]))

    const res = await POST(
      fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 96, action: 're_engagement_timeout' }),
    )
    const body = await res.json()

    expect(transitionLead).not.toHaveBeenCalled()
    expect(body.outcome).toBe('already_terminal')
  })

  it('re_engagement_timeout: skips a lead that has interacted since the final nudge was delivered (e.g. tapped "Sí, quiero continuar")', async () => {
    const deliveredAt = new Date(Date.now() - 60 * 60 * 1000) // 1h ago
    dbMock.select
      .mockReturnValueOnce(selectChain([{ ...BASE_LEAD, lastActivityAt: new Date() }]))
      .mockReturnValueOnce(selectChain([{ deliveredAt }]))

    const res = await POST(
      fakeRequest({ leadId: 'lead-1', phase: 1, attemptNumber: 96, action: 're_engagement_timeout' }),
    )
    const body = await res.json()

    expect(transitionLead).not.toHaveBeenCalled()
    expect(body.outcome).toBe('skipped_already_responded')
  })

  it('treats link_sent_reminder as an unrecognized action now that it has been retired', async () => {
    dbMock.select.mockReturnValue(selectChain([BASE_LEAD]))

    const res = await POST(
      fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 97, action: 'link_sent_reminder' as JobPayload['action'] }),
    )
    const body = await res.json()

    expect(body.outcome).toBe('unknown_action')
    expect(sendText).not.toHaveBeenCalled()
  })

  it('request_registration_code: skips when the lead is no longer link_sent', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'waiting_for_code' }]))

    const res = await POST(
      fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 0, action: 'request_registration_code' }),
    )
    const body = await res.json()

    expect(body.outcome).toBe('skipped_not_link_sent')
    expect(requestRegistrationCodeForLead).not.toHaveBeenCalled()
  })

  it('freeze_registration: transitions waiting_for_code leads to code_delivered_no_response', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'waiting_for_code' }]))

    const res = await POST(
      fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 99, action: 'freeze_registration' }),
    )
    const body = await res.json()

    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'code_delivered_no_response', 'inactivity_freeze', 'corr-1')
    expect(body.outcome).toBe('freeze_applied')
  })

  it('re-engage: stops the cadence and abandons the lead when too many outbound messages have piled up without a reply', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'link_sent', currentPhase: 2 }]))
    countOutboundSinceLastInbound.mockResolvedValue(5)

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 1, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_outbound_ceiling')
    expect(sendTemplateOrKeyboard).not.toHaveBeenCalled()
    expect(scheduleJob).not.toHaveBeenCalled()
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'abandono', 'outbound_ceiling_reached', 'corr-1')
  })

  it('re-engage: the outbound-ceiling stop marks a waiting_for_code lead code_delivered_no_response, not abandono', async () => {
    dbMock.select.mockReturnValue(selectChain([{ ...BASE_LEAD, leadStatus: 'waiting_for_code', currentPhase: 2 }]))
    countOutboundSinceLastInbound.mockResolvedValue(9)

    const res = await POST(fakeRequest({ leadId: 'lead-1', phase: 2, attemptNumber: 2, action: 're-engage' }))
    const body = await res.json()

    expect(body.outcome).toBe('skipped_outbound_ceiling')
    expect(transitionLead).toHaveBeenCalledWith('lead-1', 'code_delivered_no_response', 'outbound_ceiling_reached', 'corr-1')
  })
})
