import { transitionLead } from '@/lib/state-machine'
import { isTerminal } from '@/lib/state-machine/transitions'
import { sendText } from '@/lib/messaging/send'
import { cancelPendingRecontact } from '@/lib/scheduler/re-engagement'
import { supportRedirect } from './exit-messages'
import type { Lead, LeadStatus } from '@/types/lead'

export const REENGAGE_CALLBACK_CONTINUE = 'reengage:continue'
export const REENGAGE_CALLBACK_STOP = 'reengage:stop'

export function isReengageCallback(callbackData: string | undefined): boolean {
  return callbackData === REENGAGE_CALLBACK_CONTINUE || callbackData === REENGAGE_CALLBACK_STOP
}

/**
 * Handles the "¿quieres continuar?" buttons attached to the 2nd re-engagement nudge
 * (see jobs/re-engage/route.ts). "Continue" resumes the lead's normal flow via a
 * "no text, no callback" turn — the same maneuver resendPendingQuestion/handlePhase1
 * already use elsewhere for resuming mid-flow — routed through routeMessage (dynamic
 * import to avoid a cycle, since flow-router.ts imports this module statically) so
 * every pool (phase 1, link_sent, Ficha Hogar) re-shows its own correct pending step
 * and re-arms the recontact cadence as a side effect of the resumed handler's own
 * scheduleRecontact call. "Stop" records an explicit decline — distinct from silently
 * exhausting all 3 attempts (`re_engagement_exhausted`) — and cancels whatever
 * recontact attempt was still scheduled.
 */
export async function handleReengageChoice(
  lead: Lead,
  callbackData: string,
  correlationId: string,
): Promise<void> {
  if (isTerminal(lead.leadStatus as LeadStatus)) {
    await sendText(lead, supportRedirect())
    return
  }

  if (callbackData === REENGAGE_CALLBACK_STOP) {
    await cancelPendingRecontact(lead.id).catch(() => {})
    // Every nudge (jobs/re-engage/route.ts) now ships the Continue/Stop buttons, and
    // reEngagementCount is bumped there right after sending each one — so by the time
    // this callback lands, reEngagementCount identifies which attempt it was declined
    // on. Falls back to the generic reason for any count outside 1-3 (shouldn't happen,
    // but a decline should never go unrecorded over an unexpected count).
    const DECLINE_REASON_BY_ATTEMPT: Record<number, string> = {
      1: 're_engagement_declined_1st_attempt',
      2: 're_engagement_declined_2nd_attempt',
      3: 're_engagement_declined_3rd_attempt',
    }
    const reason = DECLINE_REASON_BY_ATTEMPT[lead.reEngagementCount] ?? 're_engagement_declined'
    await transitionLead(lead.id, 'abandono', reason, correlationId)
    await sendText(
      lead,
      'Entendido, no hay problema 🙏. No te seguiremos contactando por este proceso. Si cambias de opinión, escríbenos aquí para retomarlo.',
    )
    return
  }

  await sendText(lead, '¡Genial! Sigamos donde lo dejamos 👉')
  const { routeMessage } = await import('./flow-router')
  await routeMessage(
    lead,
    { channel: lead.channel, channelUserId: lead.channelUserId, text: '', callbackData: undefined },
    correlationId,
  )
}
