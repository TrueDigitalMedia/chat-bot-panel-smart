import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { conversationMessages, leads } from '@/lib/db/schema'
import { logConversationMessage } from '@/lib/db/conversation-messages'
import { routeMessage } from '@/lib/conversation/flow-router'
import { generateCorrelationId } from '@/lib/correlation'
import type { ChannelInbound } from '@/types/channel'
import type { Lead } from '@/types/lead'

export interface OutboundMessageDTO {
  id: string
  direction: 'in' | 'out'
  contentType: string
  body: string
  meta: Record<string, unknown> | null
  createdAt: string
}

export function toDTO(row: typeof conversationMessages.$inferSelect): OutboundMessageDTO {
  return {
    id: row.id,
    direction: row.direction,
    contentType: row.contentType,
    body: row.body,
    meta: row.meta ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function fetchAllMessages(leadId: string) {
  return db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.leadId, leadId))
    .orderBy(asc(conversationMessages.createdAt))
}

async function fetchOutboundSince(leadId: string, since: Date) {
  return db
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.leadId, leadId),
        eq(conversationMessages.direction, 'out'),
        gt(conversationMessages.createdAt, since),
      ),
    )
    .orderBy(asc(conversationMessages.createdAt))
}

export async function fetchLeadStatus(leadId: string): Promise<string> {
  const [row] = await db.select({ leadStatus: leads.leadStatus }).from(leads).where(eq(leads.id, leadId)).limit(1)
  return row?.leadStatus ?? 'incomplete'
}

interface PostBody {
  text?: unknown
  callbackData?: unknown
  /** Button label the visitor clicked — display-only, stored in meta so a reload can
   *  re-render the friendly text instead of the raw callback_data (spec 012 US2 polish). */
  label?: unknown
  location?: unknown
}

/**
 * One turn: parse + log the inbound message, run it through routeMessage, and return
 * the bot's reply for that same turn. Shared by the visitor-facing `/api/chat/web` POST
 * and the admin-facing `/api/conversations/[id]/reply` POST — same synchronous contract
 * (spec 012 research.md R2), only how `lead` gets resolved differs between callers.
 */
export async function processChatTurn(lead: Lead, request: NextRequest): Promise<NextResponse> {
  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const hasText = typeof body.text === 'string' && body.text.length > 0
  const hasCallback = typeof body.callbackData === 'string' && body.callbackData.length > 0
  const hasLocation =
    typeof body.location === 'object' &&
    body.location !== null &&
    typeof (body.location as { latitude?: unknown }).latitude === 'number' &&
    typeof (body.location as { longitude?: unknown }).longitude === 'number'

  const providedCount = [hasText, hasCallback, hasLocation].filter(Boolean).length
  if (providedCount !== 1) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'Exactly one of text, callbackData, or location is required' },
      { status: 400 },
    )
  }

  const location = hasLocation
    ? {
        latitude: (body.location as { latitude: number; longitude: number }).latitude,
        longitude: (body.location as { latitude: number; longitude: number }).longitude,
      }
    : undefined

  const inbound: ChannelInbound = {
    channel: 'web',
    channelUserId: lead.channelUserId,
    text: hasText ? (body.text as string) : '',
    callbackData: hasCallback ? (body.callbackData as string) : undefined,
    location,
  }

  if (hasCallback) {
    const label = typeof body.label === 'string' && body.label.length > 0 ? body.label : undefined
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'web',
      contentType: 'callback',
      body: inbound.callbackData!,
      meta: label ? { label } : undefined,
    })
  } else if (hasLocation) {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'web',
      contentType: 'system',
      body: 'location_shared',
      meta: { hasLocation: true },
    })
  } else {
    await logConversationMessage({
      leadId: lead.id,
      direction: 'in',
      channel: 'web',
      contentType: 'text',
      body: inbound.text,
    })
  }

  const beforeTurn = new Date()
  const correlationId = generateCorrelationId()

  try {
    await routeMessage(lead, inbound, correlationId)
  } catch (err) {
    console.error('[processChatTurn] Processing error:', err)
    return NextResponse.json({ error: 'processing_error' }, { status: 500 })
  }

  const newMessages = await fetchOutboundSince(lead.id, beforeTurn)
  const leadStatus = await fetchLeadStatus(lead.id)

  return NextResponse.json({ leadId: lead.id, leadStatus, messages: newMessages.map(toDTO) })
}
