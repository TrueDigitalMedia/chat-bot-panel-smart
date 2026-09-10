import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { PHASE1_EVAL_REASONS } from '@/lib/eval/qualification-eval'
import { validateTransition, isTerminal, NEVER_REENGAGE_STATUSES } from './transitions'
import { cancelAllPendingJobsForLead } from '@/lib/scheduler/re-engagement'
import type { LeadStatus } from '@/types/lead'

interface TransitionResult {
  previousStatus: LeadStatus
  newStatus: LeadStatus
}

export async function transitionLead(
  leadId: string,
  newStatus: LeadStatus,
  reason: string,
  correlationId: string,
): Promise<TransitionResult> {
  const [lead] = await db.select({ leadStatus: leads.leadStatus }).from(leads).where(eq(leads.id, leadId))

  if (!lead) throw new Error(`Lead not found: ${leadId}`)

  const from = lead.leadStatus as LeadStatus
  if (!validateTransition(from, newStatus)) {
    throw new Error(`Invalid transition: ${from} → ${newStatus}`)
  }

  await db
    .update(leads)
    .set({ leadStatus: newStatus, statusReason: reason, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  // Structured log with all 5 required fields
  console.log(
    JSON.stringify({
      event: 'lead_status_transition',
      lead_id: leadId,
      from_status: from,
      to_status: newStatus,
      correlation_id: correlationId,
      phase: reason,
      timestamp: new Date().toISOString(),
    }),
  )

  // Cancel any pending re-engagement/functional jobs the instant a lead lands somewhere
  // that should never receive automated recontact — centralized here (rather than at
  // each of the ~24 transitionLead call sites) for the same reason as the Panel Smart
  // sync and eval below: "no current or future transition can be missed". Previously
  // only 3 call sites (registration-choice.ts, the opt-out branch in flow-router.ts,
  // reengage-choice.ts's "stop") remembered to cancel — every other transition into a
  // terminal or NEVER_REENGAGE status (e.g. phase-1's not_qualified/quota_exhausted
  // declines) left a stale job to fire later, relying solely on the job route's own
  // defense-in-depth status check at send time, which itself was observed failing to
  // stop a re-engagement nudge for an already-declined lead.
  if (isTerminal(newStatus) || NEVER_REENGAGE_STATUSES.has(newStatus)) {
    await cancelAllPendingJobsForLead(leadId).catch((err) => {
      console.error('[scheduler] cancelAllPendingJobsForLead failed', { leadId, newStatus, err: String(err) })
    })
  }

  // Persistent send-suppression (audit §3.2) — when the reason means "the user asked us
  // to stop" (OPT_OUT_STATUS_REASONS, via isOptOutReason), add the contact's phone to
  // messaging_suppressions so a *future* lead row for the same phone (a returning
  // click-to-WhatsApp click) is still honored. Centralized here, like the job-cancel
  // above, so every current and future opt-out transition is covered — not just the
  // three call sites (flow-router free-text, reengage "stop", handleTwilioStop) that
  // record these reasons today. Fire-and-forget: a suppression-write failure must never
  // fail the transition itself; the lead-row terminal status is still the primary gate.
  void import('@/lib/db/suppressions')
    .then(async ({ isOptOutReason, suppressRecipient }) => {
      if (!isOptOutReason(reason)) return
      const [row] = await db
        .select({
          channel: leads.channel,
          channelUserId: leads.channelUserId,
          phoneNumber: leads.phoneNumber,
        })
        .from(leads)
        .where(eq(leads.id, leadId))
      if (!row) return
      await suppressRecipient(row, { reason, source: 'state_transition', leadId })
    })
    .catch((err) => {
      console.error('[suppressions] transition suppress failed', { leadId, reason, err: String(err) })
    })

  // Fire-and-forget Phase-1 qualification/quota eval (never blocks the chat)
  if (PHASE1_EVAL_REASONS.has(reason)) {
    void import('@/lib/eval/persist-eval')
      .then(({ evaluatePhase1Outcome }) =>
        evaluatePhase1Outcome({ leadId, correlationId, reason }),
      )
      .catch((err) => {
        console.error('[eval] phase-1 eval failed', { leadId, reason, err: String(err) })
      })
  }

  // Fire-and-forget Panel Smart / Kantar ai-lead-responses — centralized here (rather
  // than at each of the ~20 call sites across phase-1/2/3/4, registration-choice,
  // gps-capture, re-engage) so no current or future transition can be missed. The sync
  // itself diffs against the last-sent snapshot, so this is a no-op when nothing's
  // actually pending.
  void import('@/lib/panel-smart/sync')
    .then(({ syncPendingPanelSmartAnswers }) =>
      syncPendingPanelSmartAnswers(leadId, correlationId, { trigger: 'state_transition' }),
    )
    .catch((err) => {
      console.error('[panel-smart-sync] transition sync failed', { leadId, newStatus, err: String(err) })
    })

  return { previousStatus: from, newStatus }
}
