import { Client } from '@upstash/qstash'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reEngagementSchedules } from '@/lib/db/schema'
import { env } from '@/lib/env'

const qstash = new Client({ token: env.QSTASH_TOKEN })

export interface JobPayload {
  leadId: string
  phase: number
  attemptNumber: number
  action: 'trigger_code' | 're-engage' | 'freeze_registration'
}

export async function scheduleJob(
  leadId: string,
  phase: number,
  attemptNumber: number,
  delaySeconds: number,
  action: JobPayload['action'],
): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
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
