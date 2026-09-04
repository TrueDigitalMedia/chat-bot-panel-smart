import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leadProcessingLocks } from '@/lib/db/schema'

/**
 * How long a claimed lock is considered fresh before another caller may reclaim it.
 * Not a hard mutex — a lease. Set well above any single routeMessage turn should
 * realistically take (AI calls, DB writes, outbound sends) so a live holder is never
 * pre-empted, but low enough that a crashed/hung request (function timeout, uncaught
 * throw before the `finally` release) doesn't strand a lead locked for long.
 */
const LEASE_SECONDS = 20

/** How long acquireWithWait keeps retrying before giving up and processing anyway
 *  (fail-open — dropping a real inbound WhatsApp/Telegram message is worse than the
 *  rare remaining race). */
const MAX_WAIT_MS = 10_000
const POLL_INTERVAL_MS = 300

/**
 * Atomically claims the lead's lock if it's free or its lease has expired. One round
 * trip (INSERT .. ON CONFLICT .. RETURNING), safe over the Neon HTTP driver's
 * one-statement-per-call model — no interactive transaction needed.
 */
async function tryAcquire(leadId: string): Promise<boolean> {
  const rows = await db
    .insert(leadProcessingLocks)
    .values({ leadId, lockedAt: new Date() })
    .onConflictDoUpdate({
      target: leadProcessingLocks.leadId,
      set: { lockedAt: new Date() },
      setWhere: sql`${leadProcessingLocks.lockedAt} IS NULL OR ${leadProcessingLocks.lockedAt} < now() - interval '${sql.raw(String(LEASE_SECONDS))} seconds'`,
    })
    .returning({ leadId: leadProcessingLocks.leadId })
  return rows.length > 0
}

async function release(leadId: string): Promise<void> {
  await db.update(leadProcessingLocks).set({ lockedAt: null }).where(eq(leadProcessingLocks.leadId, leadId))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Serializes concurrent turns for the same lead. Near-simultaneous webhook deliveries
 * (a flaky WhatsApp client retry, or genuinely distinct provider message ids arriving
 * within milliseconds of each other — see the 2026-09 conversation audit) otherwise
 * race through routeMessage on the same stale lead snapshot, each taking the "first
 * turn" branch independently and producing duplicate/out-of-order replies. The
 * providerMessageId dedupe in handle-inbound.ts doesn't catch this because the
 * messages carry different ids.
 *
 * Blocks (polls) for up to MAX_WAIT_MS waiting for a held lock to free, then runs `fn`
 * regardless — fails open rather than silently dropping a real inbound message if
 * something is stuck.
 */
export async function withLeadLock<T>(leadId: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + MAX_WAIT_MS
  let acquired = await tryAcquire(leadId)
  while (!acquired && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    acquired = await tryAcquire(leadId)
  }
  if (!acquired) {
    console.warn('[lead-lock] gave up waiting, processing without the lock', { leadId })
  }
  try {
    return await fn()
  } finally {
    if (acquired) await release(leadId)
  }
}
