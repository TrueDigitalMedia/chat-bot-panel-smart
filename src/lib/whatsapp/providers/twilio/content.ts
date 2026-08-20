import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { twilioContentCache } from '@/lib/db/schema'
import { env, isTwilioConfigured } from '@/lib/env'
import type { InlineKeyboardButton } from '@/types/telegram'

// L1 cache for repeat calls within the same warm serverless instance — the DB
// (twilio_content_cache) is the layer that actually survives cold starts and is
// shared across every instance, which a plain in-memory Map never was.
const memCache = new Map<string, string>()

function authHeader(): string {
  const sid = env.TWILIO_ACCOUNT_SID!
  const token = env.TWILIO_AUTH_TOKEN!
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function cacheKey(kind: string, body: string, actions: { title: string; id: string }[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ kind, body, actions }))
    .digest('hex')
    .slice(0, 32)
}

async function createContent(payload: Record<string, unknown>): Promise<string> {
  if (!isTwilioConfigured()) throw new Error('Twilio not configured')

  const res = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as { sid?: string; message?: string; code?: number }
  if (!res.ok || !data.sid) {
    throw new Error(
      `Twilio Content API error: ${res.status} ${data.message ?? JSON.stringify(data)}`,
    )
  }
  return data.sid
}

/**
 * Resolves a Content SID for `key`, checking the in-memory cache, then the DB, and
 * only calling Twilio (which is what created a visible duplicate template) on an
 * actual miss in both. If two cold starts race and both miss the DB lookup, the
 * unique index on content_hash lets only one insert win — the loser re-reads and
 * reuses the winner's sid instead of leaving two callers pointing at two different
 * (but content-identical) Twilio resources.
 */
async function getOrCreatePersistedContent(
  key: string,
  kind: string,
  buildPayload: () => Record<string, unknown>,
): Promise<string> {
  const mem = memCache.get(key)
  if (mem) return mem

  const [existing] = await db
    .select({ contentSid: twilioContentCache.contentSid })
    .from(twilioContentCache)
    .where(eq(twilioContentCache.contentHash, key))
  if (existing) {
    memCache.set(key, existing.contentSid)
    return existing.contentSid
  }

  const sid = await createContent(buildPayload())

  const inserted = await db
    .insert(twilioContentCache)
    .values({ contentHash: key, kind, contentSid: sid })
    .onConflictDoNothing({ target: twilioContentCache.contentHash })
    .returning({ contentSid: twilioContentCache.contentSid })

  let finalSid = inserted[0]?.contentSid
  if (!finalSid) {
    const [winner] = await db
      .select({ contentSid: twilioContentCache.contentSid })
      .from(twilioContentCache)
      .where(eq(twilioContentCache.contentHash, key))
    finalSid = winner?.contentSid ?? sid
  }

  memCache.set(key, finalSid)
  return finalSid
}

/** Create or reuse a twilio/quick-reply Content SID (max 3 buttons in-session). */
export async function getOrCreateQuickReplyContent(
  body: string,
  buttons: InlineKeyboardButton[],
): Promise<string> {
  const actions = buttons.slice(0, 3).map((b) => ({
    title: truncate(b.text, 20),
    id: truncate(b.callback_data, 200),
  }))
  const bodyText = truncate(body, 1024)
  const key = cacheKey('qr', bodyText, actions)

  return getOrCreatePersistedContent(key, 'qr', () => ({
    friendly_name: `qr_${key}`,
    language: 'es',
    types: {
      'twilio/quick-reply': {
        body: bodyText,
        actions,
      },
    },
  }))
}

/** List picker for 4–10 options (WhatsApp). */
export async function getOrCreateListPickerContent(
  body: string,
  buttons: InlineKeyboardButton[],
): Promise<string> {
  // `description` is optional — omitted, not copied from `item`, so WhatsApp's list
  // confirmation bubble doesn't render the same label twice stacked on two lines.
  const items = buttons.slice(0, 10).map((b) => ({
    item: truncate(b.text, 24),
    id: truncate(b.callback_data, 200),
  }))
  const bodyText = truncate(body, 1024)
  // 'lp2' (not 'lp') so this never resolves to a Content SID cached under the old key
  // shape from before description was dropped.
  const key = cacheKey(
    'lp2',
    bodyText,
    items.map((i) => ({ title: i.item, id: i.id })),
  )

  return getOrCreatePersistedContent(key, 'lp2', () => ({
    friendly_name: `lp_${key}`,
    language: 'es',
    types: {
      'twilio/list-picker': {
        body: bodyText,
        button: 'Elegir',
        items,
      },
    },
  }))
}

export function flattenButtons(buttons: InlineKeyboardButton[][]): InlineKeyboardButton[] {
  return buttons.flat()
}
