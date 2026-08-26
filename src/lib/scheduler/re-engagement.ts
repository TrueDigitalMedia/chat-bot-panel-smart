import { Client } from '@upstash/qstash'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reEngagementSchedules, leads } from '@/lib/db/schema'
import { env, appBaseUrl } from '@/lib/env'
import { isTerminal } from '@/lib/state-machine/transitions'
import { reengagementDelaySeconds } from './constants'
import type { LeadStatus } from '@/types/lead'

const qstash = new Client({ token: env.QSTASH_TOKEN })

export interface JobPayload {
  leadId: string
  phase: number
  attemptNumber: number
  action:
    | 'request_registration_code'
    | 'registration_code_timeout'
    | 're-engage'
    | 're_engagement_timeout'
    | 'freeze_registration'
}

export async function scheduleJob(
  leadId: string,
  phase: number,
  attemptNumber: number,
  delaySeconds: number,
  action: JobPayload['action'],
): Promise<string> {
  // Must match phase-2.ts's link-building resolution — QStash needs a publicly
  // reachable URL to call back into; a bare NEXT_PUBLIC_BASE_URL check here (without
  // the APP_BASE_URL fallback) silently defaulted to localhost whenever only
  // APP_BASE_URL was configured (the common case — see .env), which QStash can't reach.
  const baseUrl = appBaseUrl()
  const payload: JobPayload = { leadId, phase, attemptNumber, action }

  const result = await qstash.publishJSON({
    url: `${baseUrl}/api/jobs/re-engage`,
    body: payload,
    delay: delaySeconds,
    deduplicationId: `${leadId}-${phase}-${attemptNumber}-${action}`,
  })

  const messageId = result.messageId

  // onConflictDoUpdate (not DoNothing): the unique key is (leadId, phase, attemptNumber),
  // and re-arming the same attempt (e.g. phase-1's rolling attempt-1 timer re-armed on
  // every turn) re-uses that same key. DoNothing silently dropped the new row on every
  // re-arm after the first — the fresh qstashMessageId was never persisted, so the new
  // QStash message became permanently uncancellable (cancelPendingJobs could only ever
  // find and cancel the *original* message, not the one actually still scheduled) and
  // orphaned reminders accumulated. Also reset deliveredAt/outcome so a re-armed job
  // reads as pending again, not as the previous (already-fired-or-cancelled) attempt.
  await db
    .insert(reEngagementSchedules)
    .values({
      leadId,
      phase,
      attemptNumber,
      action,
      scheduledAt: new Date(),
      qstashMessageId: messageId,
    })
    .onConflictDoUpdate({
      target: [reEngagementSchedules.leadId, reEngagementSchedules.phase, reEngagementSchedules.attemptNumber],
      set: {
        action,
        scheduledAt: new Date(),
        qstashMessageId: messageId,
        deliveredAt: null,
        outcome: null,
      },
    })

  return messageId
}

export async function cancelPendingJobs(leadId: string, phase: number): Promise<void> {
  const pending = await db
    .select()
    .from(reEngagementSchedules)
    .where(
      and(
        eq(reEngagementSchedules.leadId, leadId),
        eq(reEngagementSchedules.phase, phase),
      ),
    )

  await cancelJobs(pending)
}

/**
 * Cancels only 're-engage' (recontact) jobs for a lead, across every phase — unlike
 * cancelPendingJobs, which is scoped to a single phase and would miss a recontact job
 * archived under a stale/mismatched phase (e.g. one scheduled while the lead was still
 * in phase 1, moments before a transition to phase 2 within the same turn). Leaves
 * functional jobs (request_registration_code/registration_code_timeout/
 * freeze_registration) untouched even if they share a phase with a cancelled row.
 */
export async function cancelPendingRecontact(leadId: string): Promise<void> {
  const pending = await db
    .select()
    .from(reEngagementSchedules)
    .where(
      and(
        eq(reEngagementSchedules.leadId, leadId),
        eq(reEngagementSchedules.action, 're-engage'),
      ),
    )

  await cancelJobs(pending)
}

/**
 * Single entry point every phase handler calls at the end of a turn to (re)arm the
 * lead's one live recontact timer. Always re-reads leadStatus/currentPhase fresh from
 * the DB rather than trusting an in-memory `lead` object passed around the call chain —
 * a phase handler can transition the lead synchronously within the same turn (e.g.
 * phase-1 completing the survey and calling into phase-2), and a stale snapshot taken
 * before that transition previously caused a phase-1-flavored job to be scheduled even
 * after the lead had already moved on. Always cancels any previously-pending recontact
 * job first, so there is never more than one live schedule per lead regardless of which
 * phase scheduled it.
 */
export async function scheduleRecontact(leadId: string, correlationId: string): Promise<void> {
  const [lead] = await db
    .select({ leadStatus: leads.leadStatus, currentPhase: leads.currentPhase })
    .from(leads)
    .where(eq(leads.id, leadId))
  if (!lead) return

  await cancelPendingRecontact(leadId).catch(() => {})

  if (isTerminal(lead.leadStatus as LeadStatus)) return

  const delay = reengagementDelaySeconds(1)
  await scheduleJob(leadId, lead.currentPhase, 1, delay, 're-engage').catch((err) => {
    console.error('[scheduler] scheduleRecontact failed', { leadId, correlationId, err: String(err) })
  })
}

/** Same as cancelPendingJobs but across every phase — used when a lead is being deleted entirely. */
export async function cancelAllPendingJobsForLead(leadId: string): Promise<void> {
  const pending = await db
    .select()
    .from(reEngagementSchedules)
    .where(eq(reEngagementSchedules.leadId, leadId))

  await cancelJobs(pending)
}

async function cancelJobs(pending: Array<typeof reEngagementSchedules.$inferSelect>): Promise<void> {
  for (const job of pending) {
    if (job.qstashMessageId && !job.outcome) {
      try {
        await qstash.messages.delete(job.qstashMessageId)
      } catch {
        // Message may have already fired — ignore
      }
      await db
        .update(reEngagementSchedules)
        .set({ outcome: 'cancelled' })
        .where(eq(reEngagementSchedules.id, job.id))
    }
  }
}
