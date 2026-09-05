import { getLeadByChannelUser, hasOptedOut } from '@/lib/db/leads'
import { transitionLead } from '@/lib/state-machine'
import { validateTransition, isTerminal } from '@/lib/state-machine/transitions'
import { generateCorrelationId } from '@/lib/correlation'
import type { LeadStatus } from '@/types/lead'

/**
 * A WhatsApp send to this recipient failed with Twilio error 21610 (recipient
 * unsubscribed). Twilio blocked it at its own layer because the user texted STOP
 * directly to Twilio — which Advanced Opt-Out does not reliably forward to our webhook,
 * so `hasOptedOut(lead)` was still false and the re-engage cadence kept scheduling
 * nudges that all bounced. Sync our own opt-out state from the failure: move the lead
 * to a terminal / never-re-engage status with reason `twilio_stop` (in
 * OPT_OUT_STATUS_REASONS), which also cancels every pending job via transitionLead.
 *
 * Idempotent and best-effort: a no-op if the lead is unknown, already opted out, or
 * already terminal, and every path swallows its own errors — this runs inside an
 * outbound-send catch block and must never turn a delivery failure into a throw.
 */
export async function handleTwilioStop(channelUserId: string): Promise<void> {
  try {
    const lead = await getLeadByChannelUser('whatsapp', channelUserId)
    if (!lead) return

    const from = lead.leadStatus as LeadStatus
    if (hasOptedOut(lead) || isTerminal(from)) return

    // Mirror flow-router's optOutTargetStatus: a lead past code delivery can still
    // honor a late registration tap, so it lands in code_delivered_not_registered
    // rather than abandono; everything earlier in the funnel goes straight to abandono.
    const target: LeadStatus = from === 'code_delivered_no_response' ? 'code_delivered_not_registered' : 'abandono'
    if (!validateTransition(from, target)) return

    await transitionLead(lead.id, target, 'twilio_stop', generateCorrelationId())
    console.warn('[whatsapp:send] synced Twilio STOP opt-out', { leadId: lead.id, from, target })
  } catch (err) {
    console.error('[whatsapp:send] handleTwilioStop failed', {
      channelUserId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
