import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateWebSessionId } from '@/lib/web/session'
import { upsertLead } from '@/lib/db/leads'
import { handlePhase1 } from '@/lib/conversation/phases/phase-1'
import { generateCorrelationId } from '@/lib/correlation'
import { fetchAllMessages, fetchLeadStatus, processChatTurn, toDTO } from '@/lib/web/process-turn'
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

/** One turn: visitor sends a message, response includes the bot's reply for that same turn. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const lead = await resolveLead()

  if (!checkRateLimit(lead.channelUserId)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  // Synchronous (no after()) — the visitor's HTTP response IS the bot's reply
  // (spec 012 research.md R2), unlike the fire-and-forget Telegram/WhatsApp webhooks.
  return processChatTurn(lead, request)
}
