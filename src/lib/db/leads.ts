import { and, eq, inArray } from 'drizzle-orm'
import { db } from './client'
import {
  leads,
  surveyProfiles,
  flowStates,
  fichaHogarProfiles,
  reEngagementSchedules,
  systemCallLogs,
  treintaPanelistRecords,
  treintaPanelistEmbeddings,
  consentEvents,
} from './schema'
import type { Channel } from '@/types/channel'
import type { Lead } from '@/types/lead'

type ConsentType = 'opt_in' | 'terms' | 're_engagement' | 'opt_out'

/**
 * Immutable audit record of a consent decision (date/time, channel, exact text
 * shown, and the decision) — kept separate from the leads.*Accepted booleans,
 * which drive flow gating and get overwritten on retries/resets.
 */
export async function recordConsentEvent(
  leadId: string,
  consentType: ConsentType,
  channel: Channel,
  decision: boolean,
  consentTextShown: string,
  userMessageText?: string,
): Promise<void> {
  await db
    .insert(consentEvents)
    .values({ leadId, consentType, channel, decision, consentTextShown, userMessageText: userMessageText || null })
}

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
 * Permanently deletes a lead and everything tied to it. `conversation_messages` and
 * `conversation_evals` cascade automatically (schema.ts); the rest reference `leads.id`
 * with no cascade, so they're deleted here first, children before parents. Neon's
 * HTTP driver doesn't support interactive transactions (no other code in this repo
 * uses db.transaction), so these run sequentially rather than atomically.
 */
export async function deleteConversation(leadId: string): Promise<boolean> {
  const lead = await getLeadById(leadId)
  if (!lead) return false

  const { cancelAllPendingJobsForLead } = await import('@/lib/scheduler/re-engagement')
  await cancelAllPendingJobsForLead(leadId).catch(() => {})

  const records = await db
    .select({ id: treintaPanelistRecords.id })
    .from(treintaPanelistRecords)
    .where(eq(treintaPanelistRecords.leadId, leadId))
  if (records.length > 0) {
    await db.delete(treintaPanelistEmbeddings).where(
      inArray(
        treintaPanelistEmbeddings.recordId,
        records.map((r) => r.id),
      ),
    )
  }
  await db.delete(treintaPanelistRecords).where(eq(treintaPanelistRecords.leadId, leadId))
  await db.delete(systemCallLogs).where(eq(systemCallLogs.leadId, leadId))
  await db.delete(reEngagementSchedules).where(eq(reEngagementSchedules.leadId, leadId))
  await db.delete(flowStates).where(eq(flowStates.leadId, leadId))
  await db.delete(fichaHogarProfiles).where(eq(fichaHogarProfiles.leadId, leadId))
  await db.delete(surveyProfiles).where(eq(surveyProfiles.leadId, leadId))
  await db.delete(leads).where(eq(leads.id, leadId))

  return true
}

/**
 * Un-declines a lead stuck in `not_qualified`/`quota_exhausted` from saying "No" at the
 * opt-in/D1/D3 gate (not the other paths to those statuses, e.g. a real no-quota
 * result after finishing the survey — that has d3IsShopper: true, so it falls through
 * to `null` below and this returns null). Resumes exactly at the declined gate: earlier
 * accepted gates are left untouched, that gate and everything after it go back to their
 * unanswered defaults, and leadStatus returns to `incomplete` (bypassing the state
 * machine deliberately, same as resetLeadConversation's restart path).
 */
export async function reviveDeclinedLead(lead: Lead): Promise<Lead | null> {
  let patch: Record<string, unknown> | null = null
  if (!lead.optInAccepted) {
    patch = {}
  } else if (!lead.d1Accepted) {
    patch = {}
  } else if (lead.d3IsShopper === false) {
    patch = { d3IsShopper: null }
  }
  if (!patch) return null

  const [revived] = await db
    .update(leads)
    .set({ ...patch, leadStatus: 'incomplete', updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
    .returning()
  return revived as Lead
}

/**
 * The reasons request-registration-code.ts / jobs/re-engage's registration_code_timeout
 * can move a lead from `link_sent` to `abandono` on their own, with no user decline
 * involved — TDM never got requested/configured, or never answered in time.
 */
export const LINK_SENT_TIMEOUT_REASONS = new Set([
  'tdm_registration_request_timeout',
  'code_request_not_configured',
  'code_request_missing_profile',
])

/**
 * statusReasons that mean the lead explicitly asked to stop being contacted — a
 * free-text "STOP"/"ya no me escriban" (`user_freetext_opt_out`) or a "No, gracias" tap
 * on a re-engagement nudge (`re_engagement_declined_*`). Any flow-router branch that
 * runs after the opt-out must treat these as a definitive opt-out and never reinterpret
 * a later message as fresh consent or reply to it with an AI-generated message.
 * `re_engagement_exhausted` (3 nudges silently ignored, no explicit STOP) is deliberately
 * NOT in this set — that's a silent drop-off, not an express opt-out.
 */
export const OPT_OUT_STATUS_REASONS = new Set([
  'user_freetext_opt_out',
  're_engagement_declined_1st_attempt',
  're_engagement_declined_2nd_attempt',
  're_engagement_declined_3rd_attempt',
  're_engagement_declined',
])

export function hasOptedOut(lead: Pick<Lead, 'statusReason'>): boolean {
  return OPT_OUT_STATUS_REASONS.has(lead.statusReason ?? '')
}

/**
 * Un-abandons a lead whose `link_sent` -> `abandono` move was one of the TDM timeout
 * reasons above, not a user decline — a late "Ya la descargué" tap here means the
 * registration code request is still worth retrying rather than telling a qualified
 * lead their registration can't continue. Bypasses the state machine deliberately,
 * same as reviveDeclinedLead/resetLeadConversation.
 */
export async function reviveAbandonedLinkSent(lead: Lead): Promise<Lead | null> {
  if (lead.leadStatus !== 'abandono' || !LINK_SENT_TIMEOUT_REASONS.has(lead.statusReason ?? '')) {
    return null
  }
  const [revived] = await db
    .update(leads)
    .set({ leadStatus: 'link_sent', updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
    .returning()
  return revived as Lead
}

/**
 * Applies a phone number recovered via missing-phone-recovery.ts (a WhatsApp lead stuck
 * at link_sent/abandono because Twilio sent a BSUID instead of a real phone number — see
 * phone.ts's channelRequiresPhonePrompt) and puts the lead back at `link_sent` so the
 * registration code request gets retried with a real phone this time. Caller is
 * responsible for actually retrying the request.
 */
export async function applyPhoneRemediation(leadId: string, phone: string): Promise<Lead> {
  const [updated] = await db
    .update(leads)
    .set({ phoneNumber: phone, leadStatus: 'link_sent', statusReason: 'phone_remediation_applied', updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning()
  return updated as Lead
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
      pendingWaChoices: null,
      updatedAt: now,
    })
    .where(eq(flowStates.leadId, leadId))

  return lead as Lead
}
