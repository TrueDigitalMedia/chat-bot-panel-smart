import { Client } from '@upstash/qstash'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reEngagementSchedules } from '@/lib/db/schema'
import { env, appBaseUrl } from '@/lib/env'

const qstash = new Client({ token: env.QSTASH_TOKEN })

export interface JobPayload {
  leadId: string
  phase: number
  attemptNumber: number
  action: 'trigger_code' | 're-engage' | 'freeze_registration' | 'link_sent_reminder'
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

  await db.insert(reEngagementSchedules).values({
    leadId,
    phase,
    attemptNumber,
    scheduledAt: new Date(),
    qstashMessageId: messageId,
  }).onConflictDoNothing()

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
