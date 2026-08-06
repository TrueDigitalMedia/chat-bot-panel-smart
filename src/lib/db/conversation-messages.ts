import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from './client'
import { conversationMessages, leads, surveyProfiles } from './schema'
import { getLatestEvalForLead, getLatestEvalsForLeads } from '@/lib/eval/persist-eval'
import type { Channel } from '@/types/channel'

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
    })
  } catch (err) {
    console.error('[conversation_messages] log failed', err)
  }
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
  leadStatus: string
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

export async function listConversations(limit = 50): Promise<ConversationListItem[]> {
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
    .orderBy(desc(leads.lastActivityAt))
    .limit(limit)

  if (rows.length === 0) {
    return []
  }

  const ids = rows.map((r) => r.id)
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

  return rows.map((r) => {
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
      d2Accepted: leads.d2Accepted,
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
