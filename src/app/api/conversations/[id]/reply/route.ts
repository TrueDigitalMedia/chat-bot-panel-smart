import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { processChatTurn } from '@/lib/web/process-turn'
import type { Lead } from '@/types/lead'

/**
 * Admin-only: reply into an already-started conversation as if the visitor typed it,
 * for leads on the `web` channel. Reuses the same synchronous turn processing as the
 * visitor-facing `/api/chat/web` POST (spec 012), just resolving the lead by `id`
 * (admin session) instead of the visitor's own session cookie.
 *
 * Restricted to `channel === 'web'` — for Telegram/WhatsApp leads, `sendText`/
 * `sendInlineKeyboard` (src/lib/messaging/send.ts) would push a REAL message to that
 * person's real chat via the Telegram/WhatsApp API, which is never what an admin
 * "testing a reply" from this page intends.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1)
  if (!lead) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (lead.channel !== 'web') {
    return NextResponse.json(
      { error: 'unsupported_channel', message: 'Solo se puede responder conversaciones del canal web' },
      { status: 400 },
    )
  }

  return processChatTurn(lead as Lead, request)
}
