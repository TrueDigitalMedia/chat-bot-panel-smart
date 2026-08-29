import { and, asc, count, desc, eq, gt, inArray, ne } from 'drizzle-orm'
import { db } from './client'
import { conversationMessages, leads, surveyProfiles } from './schema'
import { getLatestEvalForLead, getLatestEvalsForLeads } from '@/lib/eval/persist-eval'
import type { Channel } from '@/types/channel'
import type { LeadStatus } from '@/types/lead'

export type MessageDirection = 'in' | 'out'
export type MessageContentType =
  | 'text'
  | 'callback'
  | 'contact'
  | 'keyboard'
  | 'video'
  | 'system'

export interface LogMessageInput {
  leadId: string
  direction: MessageDirection
  channel: Channel
  contentType?: MessageContentType
  body: string
  meta?: Record<string, unknown>
  providerMessageId?: string
}

/** Fire-and-forget safe logger — never breaks the chat flow. */
export async function logConversationMessage(input: LogMessageInput): Promise<void> {
  try {
    await db.insert(conversationMessages).values({
      leadId: input.leadId,
      direction: input.direction,
      channel: input.channel,
      contentType: input.contentType ?? 'text',
      body: input.body.slice(0, 8000),
      meta: input.meta ?? null,
      providerMessageId: input.providerMessageId,
    })
  } catch (err) {
    console.error('[conversation_messages] log failed', err)
  }
}

/**
 * True once an inbound message with this provider id (WhatsApp/Twilio's message.id /
 * MessageSid) has already been logged for this channel — WhatsApp/Twilio can redeliver
 * the same webhook (slow ack, transient 5xx, network blip), and without this check each
 * redelivery re-ran the full routing/AI/send pipeline as if it were a brand-new user
 * message, producing duplicate replies. Checked before any processing, not just before
 * the final log write — a check-then-insert race is possible under truly concurrent
 * redeliveries, but real providers don't fire those sub-second, and the deterministic
 * repeat-send cap (messaging/send.ts) is the backstop either way.
 */
export async function wasProviderMessageAlreadyProcessed(
  channel: Channel,
  providerMessageId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.channel, channel),
        eq(conversationMessages.providerMessageId, providerMessageId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export interface RecentMessage {
  direction: MessageDirection
  body: string
}

/** True once the bot has ever sent this lead a message — used to gate a one-time conversation opener. */
export async function hasSentOutboundMessage(leadId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(and(eq(conversationMessages.leadId, leadId), eq(conversationMessages.direction, 'out')))
    .limit(1)
  return Boolean(row)
}

export interface LastOutboundMessage {
  body: string
  meta: Record<string, unknown> | null
}

/** Most recent outbound message for a lead — used to detect an about-to-repeat
 *  verbatim re-prompt (e.g. the user's reply didn't advance the conversation and the
 *  same gate/question is about to be re-shown) so it can be varied instead. */
export async function getLastOutboundMessage(leadId: string): Promise<LastOutboundMessage | null> {
  const [row] = await db
    .select({ body: conversationMessages.body, meta: conversationMessages.meta })
    .from(conversationMessages)
    .where(and(eq(conversationMessages.leadId, leadId), eq(conversationMessages.direction, 'out')))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Number of outbound messages (excluding contentType 'system') sent to this lead since
 * their most recent inbound message — or since the start of the conversation if they
 * have never replied. This is the "business-initiated messages without a reply" metric
 * that spans every subsystem (code request, timeouts, re-engagement, freeze), unlike
 * `dedupeRepeat` in messaging/send.ts which only catches byte-identical consecutive text.
 * Used as the global backstop against the spaced-burst pattern that tanks Meta quality.
 */
export async function countOutboundSinceLastInbound(leadId: string): Promise<number> {
  const [lastIn] = await db
    .select({ createdAt: conversationMessages.createdAt })
    .from(conversationMessages)
    .where(and(eq(conversationMessages.leadId, leadId), eq(conversationMessages.direction, 'in')))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(1)

  const conditions = [
    eq(conversationMessages.leadId, leadId),
    eq(conversationMessages.direction, 'out'),
    ne(conversationMessages.contentType, 'system'),
  ]
  if (lastIn) conditions.push(gt(conversationMessages.createdAt, lastIn.createdAt))

  const [row] = await db
    .select({ n: count() })
    .from(conversationMessages)
    .where(and(...conditions))
  return row?.n ?? 0
}

/** Last `limit` turns for a lead, oldest → newest — used to ground LLM context in what was actually said. */
export async function getRecentMessages(leadId: string, limit = 8): Promise<RecentMessage[]> {
  const rows = await db
    .select({
      direction: conversationMessages.direction,
      body: conversationMessages.body,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.leadId, leadId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(limit)
  return rows.reverse()
}

export type ConversationListItem = {
  id: string
  channel: Channel
  channelUserId: string
  channelUsername: string | null
  phoneNumber: string | null
  leadStatus: LeadStatus
  statusReason: string | null
  currentPhase: number
  surveyQuestionIndex: number
  lastActivityAt: Date
  createdAt: Date
  fullName: string | null
  country: string | null
  lastMessage: string | null
  lastMessageAt: Date | null
  messageCount: number
  evalScore: number | null
  evalPassed: boolean | null
  evalReason: string | null
}

export interface ListConversationsOptions {
  status?: LeadStatus
  limit?: number
  offset?: number
}

export async function listConversations(
  opts: ListConversationsOptions = {},
): Promise<{ items: ConversationListItem[]; hasMore: boolean }> {
  const limit = opts.limit ?? 25

  const conditions = []
  if (opts.status) conditions.push(eq(leads.leadStatus, opts.status))

  // Fetch one extra row to detect whether a next page exists, without a separate
  // COUNT(*) query — sliced back down to `limit` before any of the per-lead lookups
  // below (message stats, evals) run, so that lookahead row never leaks into them.
  const rows = await db
    .select({
      id: leads.id,
      channel: leads.channel,
      channelUserId: leads.channelUserId,
      channelUsername: leads.channelUsername,
      phoneNumber: leads.phoneNumber,
      leadStatus: leads.leadStatus,
      statusReason: leads.statusReason,
      currentPhase: leads.currentPhase,
      surveyQuestionIndex: leads.surveyQuestionIndex,
      lastActivityAt: leads.lastActivityAt,
      createdAt: leads.createdAt,
      fullName: surveyProfiles.fullName,
      country: surveyProfiles.country,
    })
    .from(leads)
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(leads.lastActivityAt))
    .limit(limit + 1)
    .offset(opts.offset ?? 0)

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows

  if (pageRows.length === 0) {
    return { items: [], hasMore: false }
  }

  const ids = pageRows.map((r) => r.id)
  const msgs = await db
    .select({
      leadId: conversationMessages.leadId,
      body: conversationMessages.body,
      createdAt: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .where(inArray(conversationMessages.leadId, ids))
    .orderBy(desc(conversationMessages.createdAt))

  const stats = new Map<
    string,
    { lastMessage: string; lastMessageAt: Date; messageCount: number }
  >()
  for (const m of msgs) {
    const cur = stats.get(m.leadId)
    if (!cur) {
      stats.set(m.leadId, {
        lastMessage: m.body,
        lastMessageAt: m.createdAt,
        messageCount: 1,
      })
    } else {
      cur.messageCount += 1
    }
  }

  const evals = await getLatestEvalsForLeads(ids)

  const items = pageRows.map((r) => {
    const s = stats.get(r.id)
    const ev = evals.get(r.id)
    return {
      ...r,
      lastMessage: s?.lastMessage ?? null,
      lastMessageAt: s?.lastMessageAt ?? null,
      messageCount: s?.messageCount ?? 0,
      evalScore: ev?.overallScore ?? null,
      evalPassed: ev?.passed ?? null,
      evalReason: ev?.reason ?? null,
    }
  })

  return { items, hasMore }
}

export async function getConversationDetail(leadId: string) {
  const [lead] = await db
    .select({
      id: leads.id,
      channel: leads.channel,
      channelUserId: leads.channelUserId,
      channelUsername: leads.channelUsername,
      phoneNumber: leads.phoneNumber,
      leadStatus: leads.leadStatus,
      statusReason: leads.statusReason,
      currentPhase: leads.currentPhase,
      surveyQuestionIndex: leads.surveyQuestionIndex,
      score: leads.score,
      quotaSegment: leads.quotaSegment,
      conversationSummary: leads.conversationSummary,
      d1Accepted: leads.d1Accepted,
      d3IsShopper: leads.d3IsShopper,
      lastActivityAt: leads.lastActivityAt,
      createdAt: leads.createdAt,
      panelSmartSyncStatus: leads.panelSmartSyncStatus,
      panelSmartLastSyncAt: leads.panelSmartLastSyncAt,
      panelSmartSyncedAnswersJson: leads.panelSmartSyncedAnswersJson,
      fullName: surveyProfiles.fullName,
      country: surveyProfiles.country,
      stateProvince: surveyProfiles.stateProvince,
      municipality: surveyProfiles.municipality,
      neighborhood: surveyProfiles.neighborhood,
      nseRegion: surveyProfiles.nseRegion,
      geoSource: surveyProfiles.geoSource,
      inQuotaGeo: surveyProfiles.inQuotaGeo,
      email: surveyProfiles.email,
      gender: surveyProfiles.gender,
    })
    .from(leads)
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(eq(leads.id, leadId))
    .limit(1)

  if (!lead) return null

  const messages = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.leadId, leadId))
    .orderBy(asc(conversationMessages.createdAt))
    .limit(500)

  const evalResult = await getLatestEvalForLead(leadId)

  return { lead, messages, eval: evalResult }
}
