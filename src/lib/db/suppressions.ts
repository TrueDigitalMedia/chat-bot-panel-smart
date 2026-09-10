/**
 * Persistent send-suppression list — audit §3.2.
 *
 * Keyed by the contact identifier itself, so a STOP survives the lead row that recorded
 * it: a phone that opted out and later re-enters through a new click-to-WhatsApp ad
 * (fresh lead, `re_engagement_count` 0, no `statusReason`) is still suppressed here.
 * `messaging/send.ts` consults `isRecipientSuppressed` before every outbound send.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from './client'
import { messagingSuppressions } from './schema'
import { OPT_OUT_STATUS_REASONS } from './leads'
import { toE164 } from '@/lib/whatsapp/phone'
import { normalizePhone, isBsuidChannelUserId } from '@/lib/phone'
import type { Channel } from '@/types/channel'

export interface SuppressionSubject {
  channel: Channel
  channelUserId: string
  phoneNumber?: string | null
}

/**
 * Every identifier a given contact might be addressed by, normalized the same way the
 * suppression rows are stored. Checked/written as a set so a lead whose `channelUserId`
 * is a BSUID but who later shares a real phone (or vice versa) is still matched.
 */
export function suppressionIdentifiers(subject: SuppressionSubject): string[] {
  const ids = new Set<string>()
  const raw = subject.channelUserId?.trim()
  if (raw) {
    if (subject.channel === 'whatsapp' && !isBsuidChannelUserId(raw)) {
      ids.add(toE164(raw))
    } else {
      ids.add(raw)
    }
  }
  if (subject.phoneNumber) {
    const norm = normalizePhone(subject.phoneNumber)
    if (norm) ids.add(norm)
  }
  return [...ids]
}

/** True when any of the contact's identifiers is on the suppression list. */
export async function isRecipientSuppressed(subject: SuppressionSubject): Promise<boolean> {
  const ids = suppressionIdentifiers(subject)
  if (ids.length === 0) return false
  const rows = await db
    .select({ id: messagingSuppressions.id })
    .from(messagingSuppressions)
    .where(
      and(
        eq(messagingSuppressions.channel, subject.channel),
        inArray(messagingSuppressions.identifier, ids),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** Idempotent upsert — one row per (channel, identifier); re-suppressing refreshes the reason. */
export async function suppressRecipient(
  subject: SuppressionSubject,
  opts: { reason: string; source: string; leadId?: string },
): Promise<void> {
  const ids = suppressionIdentifiers(subject)
  if (ids.length === 0) return
  for (const identifier of ids) {
    await db
      .insert(messagingSuppressions)
      .values({
        channel: subject.channel,
        identifier,
        reason: opts.reason,
        source: opts.source,
        leadId: opts.leadId ?? null,
      })
      .onConflictDoUpdate({
        target: [messagingSuppressions.channel, messagingSuppressions.identifier],
        set: { reason: opts.reason, source: opts.source, leadId: opts.leadId ?? null },
      })
  }
}

/** Removes the contact from the suppression list — only on a confirmed opt-out reversal. */
export async function unsuppressRecipient(subject: SuppressionSubject): Promise<void> {
  const ids = suppressionIdentifiers(subject)
  if (ids.length === 0) return
  await db
    .delete(messagingSuppressions)
    .where(
      and(
        eq(messagingSuppressions.channel, subject.channel),
        inArray(messagingSuppressions.identifier, ids),
      ),
    )
}

/** True when a `transitionLead` reason means "the user asked us to stop" — the set that
 *  should also land the contact on the persistent suppression list. Mirrors
 *  `hasOptedOut`, kept as its own predicate so callers don't need a full Lead object. */
export function isOptOutReason(reason: string | null | undefined): boolean {
  return OPT_OUT_STATUS_REASONS.has(reason ?? '')
}
