import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { whatsappTemplates } from '@/lib/db/schema'

/** Resolves an approved Twilio Content SID for a logical message id, or undefined if
 *  none is registered yet or it hasn't cleared Meta's review — the caller's signal to
 *  fall back to the existing free-text/dynamic-content send path. */
export async function getApprovedTemplate(logicalId: string): Promise<{ contentSid: string } | undefined> {
  const [row] = await db
    .select({ contentSid: whatsappTemplates.contentSid })
    .from(whatsappTemplates)
    .where(
      and(
        eq(whatsappTemplates.logicalId, logicalId),
        eq(whatsappTemplates.provider, 'twilio'),
        eq(whatsappTemplates.approvalStatus, 'approved'),
      ),
    )
  return row?.contentSid ? { contentSid: row.contentSid } : undefined
}
