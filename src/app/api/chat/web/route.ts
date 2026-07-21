import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { conversationMessages, leads } from '@/lib/db/schema'
import { getOrCreateWebSessionId } from '@/lib/web/session'
import { upsertLead } from '@/lib/db/leads'
import { logConversationMessage } from '@/lib/db/conversation-messages'
import { routeMessage } from '@/lib/conversation/flow-router'
import { handlePhase1 } from '@/lib/conversation/phases/phase-1'
import { generateCorrelationId } from '@/lib/correlation'
import type { ChannelInbound } from '@/types/channel'
import type { Lead } from '@/types/lead'

// Rate limiting: same in-memory pattern as src/app/api/webhooks/telegram/route.ts —
// keyed by the web session id (spec 012 research.md R10). Applied to both GET and POST
// since GET can also create a lead / trigger the opening message.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(sessionId)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(sessionId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT
}

interface OutboundMessageDTO {
  id: string
  direction: 'in' | 'out'
  contentType: string
  body: string
  meta: Record<string, unknown> | null
  createdAt: string
}

function toDTO(row: typeof conversationMessages.$inferSelect): OutboundMessageDTO {
  return {
    id: row.id,
    direction: row.direction,
    contentType: row.contentType,
    body: row.body,
    meta: row.meta ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function fetchAllMessages(leadId: string) {
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

async function fetchLeadStatus(leadId: string): Promise<string> {
  const [row] = await db.select({ leadStatus: leads.leadStatus }).from(leads).where(eq(leads.id, leadId)).limit(1)
  return row?.leadStatus ?? 'incomplete'
}

/** Resolves (or creates) the visitor's session + lead — shared by GET and POST. */
async function resolveLead(): Promise<Lead> {
  const { sessionId } = await getOrCreateWebSessionId()
  return upsertLead('web', sessionId)
}

/** Bootstrap: resolve/create the lead, trigger the opening message on first-ever visit, return full history. */
export async function GET(): Promise<NextResponse> {
  const lead = await resolveLead()

  if (!checkRateLimit(lead.channelUserId)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const existing = await fetchAllMessages(lead.id)

  // Only trigger the opening message when this lead has never exchanged a message —
  // prevents re-sending the opt-in on every reload (spec 012 US2, T013).
  if (existing.length === 0) {
    await handlePhase1(lead, '', undefined, generateCorrelationId())
  }

  const messages = existing.length === 0 ? await fetchAllMessages(lead.id) : existing
  const leadStatus = await fetchLeadStatus(lead.id)

  return NextResponse.json({ leadId: lead.id, leadStatus, messages: messages.map(toDTO) })
}

interface PostBody {
  text?: unknown
  callbackData?: unknown
  /** Button label the visitor clicked — display-only, stored in meta so a reload can
   *  re-render the friendly text instead of the raw callback_data (spec 012 US2 polish). */
  label?: unknown
  location?: unknown
}

/** One turn: visitor sends a message, response includes the bot's reply for that same turn. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const lead = await resolveLead()

  if (!checkRateLimit(lead.channelUserId)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

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
    // Synchronous (no after()) — the visitor's HTTP response IS the bot's reply
    // (spec 012 research.md R2), unlike the fire-and-forget Telegram/WhatsApp webhooks.
    await routeMessage(lead, inbound, correlationId)
  } catch (err) {
    console.error('[api/chat/web] Processing error:', err)
    return NextResponse.json({ error: 'processing_error' }, { status: 500 })
  }

  const newMessages = await fetchOutboundSince(lead.id, beforeTurn)
  const leadStatus = await fetchLeadStatus(lead.id)

  return NextResponse.json({ leadId: lead.id, leadStatus, messages: newMessages.map(toDTO) })
}
