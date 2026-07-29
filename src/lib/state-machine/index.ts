import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { PHASE1_EVAL_REASONS } from '@/lib/eval/qualification-eval'
import { validateTransition } from './transitions'
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
    .set({ leadStatus: newStatus, updatedAt: new Date() })
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

  // Fire-and-forget TDM MySQL sync — every status transition is the end of some phase
  // and must sync regardless of outcome, qualified or not (spec 010 amendment: "todo
  // registro cuenta como lead así no califique como panelista"). Centralized here
  // (rather than at each of the ~20 call sites across phase-1/2/3/4, registration-choice,
  // gps-capture, re-engage) so no current or future transition can be missed.
  void import('@/lib/tdm-mysql/sync')
    .then(({ syncLead }) => syncLead(leadId, correlationId))
    .catch((err) => {
      console.error('[tdm-sync] transition sync failed', { leadId, newStatus, err: String(err) })
    })

  // Fire-and-forget Panel Smart / Kantar ai-lead-responses — same centralization rationale as
  // the TDM MySQL sync above, so every phase-ending transition pushes any new/changed
  // survey/ficha-hogar answers. The sync itself diffs against the last-sent snapshot, so
  // this is a no-op when nothing's actually pending.
  void import('@/lib/panel-smart/sync')
    .then(({ syncPendingPanelSmartAnswers }) => syncPendingPanelSmartAnswers(leadId, correlationId))
    .catch((err) => {
      console.error('[panel-smart-sync] transition sync failed', { leadId, newStatus, err: String(err) })
    })

  return { previousStatus: from, newStatus }
}
