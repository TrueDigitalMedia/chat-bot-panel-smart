import { and, eq } from 'drizzle-orm'
import { db } from './client'
import { leads, surveyProfiles, flowStates } from './schema'
import type { Channel } from '@/types/channel'
import type { Lead } from '@/types/lead'

export async function upsertLead(
  channel: Channel,
  channelUserId: string,
  channelUsername?: string,
): Promise<Lead> {
  const now = new Date()

  const existing = await db
    .select()
    .from(leads)
    .where(and(eq(leads.channel, channel), eq(leads.channelUserId, channelUserId)))
    .limit(1)

  if (existing.length > 0) {
    const [updated] = await db
      .update(leads)
      .set({
        lastActivityAt: now,
        updatedAt: now,
        ...(channelUsername !== undefined ? { channelUsername } : {}),
      })
      .where(and(eq(leads.channel, channel), eq(leads.channelUserId, channelUserId)))
      .returning()
    return updated as Lead
  }

  const [lead] = await db
    .insert(leads)
    .values({
      channel,
      channelUserId,
      channelUsername: channelUsername ?? null,
      lastActivityAt: now,
    })
    .returning()

  await db.insert(surveyProfiles).values({ leadId: lead.id })
  await db.insert(flowStates).values({ leadId: lead.id })

  return lead as Lead
}

export async function getLeadByChannelUser(
  channel: Channel,
  channelUserId: string,
): Promise<Lead | null> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.channel, channel), eq(leads.channelUserId, channelUserId)))
    .limit(1)
  return (lead as Lead) ?? null
}

/** @deprecated Use getLeadByChannelUser('telegram', chatId.toString()) */
export async function getLeadByChatId(chatId: bigint): Promise<Lead | null> {
  return getLeadByChannelUser('telegram', chatId.toString())
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1)
  return (lead as Lead) ?? null
}

/**
 * Hard-reset a lead so they can start the recruitment flow again (/start).
 * Clears survey answers and flow/correction state.
 */
export async function resetLeadConversation(leadId: string): Promise<Lead> {
  const now = new Date()

  const [lead] = await db
    .update(leads)
    .set({
      leadStatus: 'incomplete',
      currentPhase: 1,
      surveyQuestionIndex: 0,
      quotaSegment: null,
      score: null,
      d1Accepted: false,
      d2Accepted: null,
      d3IsShopper: null,
      conversationSummary: null,
      phoneNumber: null,
      reEngagementCount: 0,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(eq(leads.id, leadId))
    .returning()

  await db
    .update(surveyProfiles)
    .set({
      fullName: null,
      country: null,
      stateProvince: null,
      municipality: null,
      neighborhood: null,
      nseRegion: null,
      geoSource: null,
      inQuotaGeo: null,
      email: null,
      gender: null,
      educationPsh: null,
      cars: null,
      domesticHelp: null,
      householdSize: null,
      bedrooms: null,
      shoppingFrequency: null,
      shoppingCategories: null,
      contactChannel: null,
      contactSchedule: null,
      rawFreeTextJson: null,
      extractionModel: null,
      completedAt: null,
    })
    .where(eq(surveyProfiles.leadId, leadId))

  await db
    .update(flowStates)
    .set({
      currentPhase: 1,
      decisionPoint: null,
      surveyQuestionIndex: 0,
      isInFaqDigression: false,
      digressionResumeIndex: null,
      isCorrecting: false,
      correctingField: null,
      correctionResumeIndex: null,
      gpsGateStatus: null,
      gpsProposal: null,
      updatedAt: now,
    })
    .where(eq(flowStates.leadId, leadId))

  return lead as Lead
}
