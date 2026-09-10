import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setTimeout as sleep } from 'node:timers/promises'

const { dbMock, cancelAllPendingJobsForLead, syncPendingPanelSmartAnswers, suppressRecipient } =
  vi.hoisted(() => ({
    dbMock: { select: vi.fn(), update: vi.fn() },
    cancelAllPendingJobsForLead: vi.fn(),
    syncPendingPanelSmartAnswers: vi.fn(),
    suppressRecipient: vi.fn(),
  }))

vi.mock('@/lib/db/client', () => ({ db: dbMock }))
vi.mock('@/lib/scheduler/re-engagement', () => ({ cancelAllPendingJobsForLead }))
vi.mock('@/lib/panel-smart/sync', () => ({ syncPendingPanelSmartAnswers }))
vi.mock('@/lib/db/suppressions', () => ({
  suppressRecipient,
  isOptOutReason: (reason: string | null | undefined) =>
    new Set([
      'user_freetext_opt_out',
      're_engagement_declined_1st_attempt',
      're_engagement_declined_2nd_attempt',
      're_engagement_declined_3rd_attempt',
      're_engagement_declined',
      'twilio_stop',
    ]).has(reason ?? ''),
}))

import { transitionLead } from './index'

/** Chainable fake matching `db.select().from(X).where(Y)`. */
function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) }
}

/** Chainable fake matching `db.update(X).set(Y).where(Z)`. */
function updateChain() {
  return { set: () => ({ where: () => Promise.resolve(undefined) }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  cancelAllPendingJobsForLead.mockResolvedValue(undefined)
  syncPendingPanelSmartAnswers.mockResolvedValue(undefined)
  suppressRecipient.mockResolvedValue(undefined)
  dbMock.update.mockReturnValue(updateChain())
})

/** Lets fire-and-forget `void import(...).then(...)` chains in transitionLead settle. */
const flush = () => sleep(20)

describe('transitionLead — centralized job cancellation', () => {
  it('cancels all pending jobs when the lead lands on a NEVER_REENGAGE status (code_delivered_not_registered)', async () => {
    dbMock.select.mockReturnValue(selectChain([{ leadStatus: 'waiting_for_code' }]))

    await transitionLead('lead-1', 'code_delivered_not_registered', 'registration_user_decline', 'corr-1')

    expect(cancelAllPendingJobsForLead).toHaveBeenCalledWith('lead-1')
  })

  it('cancels all pending jobs when the lead lands on a terminal status (abandono)', async () => {
    dbMock.select.mockReturnValue(selectChain([{ leadStatus: 'incomplete' }]))

    await transitionLead('lead-1', 'abandono', 'user_freetext_opt_out', 'corr-1')

    expect(cancelAllPendingJobsForLead).toHaveBeenCalledWith('lead-1')
  })

  it('does not cancel jobs for a transition into a non-blocking, non-terminal status', async () => {
    dbMock.select.mockReturnValue(selectChain([{ leadStatus: 'incomplete' }]))

    await transitionLead('lead-1', 'link_sent', 'not_a_phase1_eval_reason', 'corr-1')

    expect(cancelAllPendingJobsForLead).not.toHaveBeenCalled()
  })

  it('adds the contact to the persistent suppression list on an express opt-out reason', async () => {
    dbMock.select.mockReturnValue(
      selectChain([
        { leadStatus: 'incomplete', channel: 'whatsapp', channelUserId: '+50255551234', phoneNumber: null },
      ]),
    )

    await transitionLead('lead-1', 'abandono', 'user_freetext_opt_out', 'corr-1')
    await flush()

    expect(suppressRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp', channelUserId: '+50255551234' }),
      expect.objectContaining({ reason: 'user_freetext_opt_out', source: 'state_transition', leadId: 'lead-1' }),
    )
  })

  it('does not suppress on a silent drop-off reason', async () => {
    dbMock.select.mockReturnValue(
      selectChain([
        { leadStatus: 'waiting_for_code', channel: 'whatsapp', channelUserId: '+50255551234', phoneNumber: null },
      ]),
    )

    await transitionLead('lead-1', 'abandono', 're_engagement_exhausted', 'corr-1')
    await flush()

    expect(suppressRecipient).not.toHaveBeenCalled()
  })

  it('a failing cancellation never blocks the status update itself', async () => {
    dbMock.select.mockReturnValue(selectChain([{ leadStatus: 'waiting_for_code' }]))
    cancelAllPendingJobsForLead.mockRejectedValue(new Error('qstash down'))

    const result = await transitionLead('lead-1', 'abandono', 're_engagement_exhausted', 'corr-1')

    expect(result).toEqual({ previousStatus: 'waiting_for_code', newStatus: 'abandono' })
  })
})
