import { createHash } from 'node:crypto'
import { env, isTwilioConfigured } from '@/lib/env'
import type { InlineKeyboardButton } from '@/types/telegram'

const contentCache = new Map<string, string>()

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
  const cached = contentCache.get(key)
  if (cached) return cached

  const sid = await createContent({
    friendly_name: `qr_${key}_${Date.now().toString(36)}`,
    language: 'es',
    types: {
      'twilio/quick-reply': {
        body: bodyText,
        actions,
      },
    },
  })
  contentCache.set(key, sid)
  return sid
}

/** List picker for 4–10 options (WhatsApp). */
export async function getOrCreateListPickerContent(
  body: string,
  buttons: InlineKeyboardButton[],
): Promise<string> {
  const items = buttons.slice(0, 10).map((b) => ({
    item: truncate(b.text, 24),
    id: truncate(b.callback_data, 200),
    description: truncate(b.text, 72),
  }))
  const bodyText = truncate(body, 1024)
  const key = cacheKey(
    'lp',
    bodyText,
    items.map((i) => ({ title: i.item, id: i.id })),
  )
  const cached = contentCache.get(key)
  if (cached) return cached

  const sid = await createContent({
    friendly_name: `lp_${key}_${Date.now().toString(36)}`,
    language: 'es',
    types: {
      'twilio/list-picker': {
        body: bodyText,
        button: 'Elegir',
        items,
      },
    },
  })
  contentCache.set(key, sid)
  return sid
}

export function flattenButtons(buttons: InlineKeyboardButton[][]): InlineKeyboardButton[] {
  return buttons.flat()
}
