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

  return { previousStatus: from, newStatus }
}
