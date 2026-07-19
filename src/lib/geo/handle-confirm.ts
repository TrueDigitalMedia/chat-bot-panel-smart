import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates, leads, surveyProfiles } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { askGeoConfirmation, isGeoConfirmCallback, parseGeoConfirmNo, parseGeoConfirmYes } from '@/lib/geo/confirm'
import type { GeoField } from '@/lib/geo/guatemala'
import { questionIndexForField } from '@/lib/conversation/correction-fields'
import { sendSurveyQuestion } from '@/lib/conversation/send-survey-question'
import { SURVEY_QUESTION_COUNT } from '@/lib/conversation/survey-questions'
import { EXIT_B, EXIT_B_THANKS } from '@/lib/conversation/exit-messages'
import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'
import { checkQuotaAvailability } from '@/lib/scoring/quota'
import { transitionLead } from '@/lib/state-machine'
import type { Lead } from '@/types/lead'

/**
 * Persist a survey field and advance to the next question (normal survey path).
 */
export async function persistSurveyFieldAndAdvance(
  lead: Lead,
  field: string,
  value: unknown,
  correlationId: string,
): Promise<void> {
  const to = lead
  const idx = questionIndexForField(field as Parameters<typeof questionIndexForField>[0])
  // Prefer lead's current index when field matches current question; else use field index
  const currentIdx =
    lead.surveyQuestionIndex >= 1 && lead.surveyQuestionIndex <= SURVEY_QUESTION_COUNT
      ? lead.surveyQuestionIndex
      : idx

  await db
    .update(surveyProfiles)
    .set({ [field]: value } as Record<string, unknown>)
    .where(eq(surveyProfiles.leadId, lead.id))

  if (field === 'municipality') {
    await sendText(to, `He entendido que tu municipio es ${value}.`)
    const [profile] = await db
      .select()
      .from(surveyProfiles)
      .where(eq(surveyProfiles.leadId, lead.id))
      .limit(1)
    if (profile?.country && profile.stateProvince) {
      const { applyManualMunicipalityAllowlist } = await import(
        '@/lib/conversation/gps-capture'
      )
      const result = await applyManualMunicipalityAllowlist(lead, {
        country: profile.country,
        stateProvince: profile.stateProvince,
        municipality: String(value),
        geoSource: 'text_fuzzy',
        correlationId,
      })
      if (!result.ok) return
    }
  }

  const nextIdx = currentIdx + 1
  await db
    .update(leads)
    .set({ surveyQuestionIndex: nextIdx, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({ surveyQuestionIndex: nextIdx, updatedAt: new Date() })
    .where(eq(flowStates.leadId, lead.id))

  if (nextIdx === 2) {
    const { requestGps } = await import('@/lib/conversation/gps-capture')
    await requestGps({ ...lead, surveyQuestionIndex: nextIdx })
    return
  }

  if (nextIdx <= SURVEY_QUESTION_COUNT) {
    await sendSurveyQuestion(to, nextIdx, lead.id)
    return
  }

  await db
    .update(surveyProfiles)
    .set({ completedAt: new Date() })
    .where(eq(surveyProfiles.leadId, lead.id))

  const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))
  const score = calculateScore({
    educationPsh: profile.educationPsh,
    cars: profile.cars,
    domesticHelp: profile.domesticHelp,
    householdSize: profile.householdSize,
    bedrooms: profile.bedrooms,
  })
  const segment = getQuotaSegment(score)
  await db.update(leads).set({ score, quotaSegment: segment, updatedAt: new Date() }).where(eq(leads.id, lead.id))

  const hasQuota = await checkQuotaAvailability({
    country: profile.country ?? '',
    nseRegion: profile.nseRegion ?? '',
    segment,
    leadId: lead.id,
  })
  if (!hasQuota) {
    await transitionLead(lead.id, 'quota_exhausted', 'survey_complete_no_quota', correlationId)
    await sendText(to, EXIT_B)
    await sendText(to, EXIT_B_THANKS)
    return
  }

  await transitionLead(lead.id, 'link_sent', 'survey_complete_quota_available', correlationId)
  const { handlePhase2 } = await import('@/lib/conversation/phases/phase-2')
  await handlePhase2(lead, correlationId)
}

export async function handleGeoConfirmCallback(
  lead: Lead,
  callbackData: string,
  correlationId: string,
): Promise<boolean> {
  if (!isGeoConfirmCallback(callbackData)) return false

  const yes = parseGeoConfirmYes(callbackData)
  if (yes) {
    // Ensure we're on the right question index for this field before advancing
    const fieldIdx = questionIndexForField(yes.field as Parameters<typeof questionIndexForField>[0])
    if (lead.surveyQuestionIndex !== fieldIdx) {
      await db
        .update(leads)
        .set({ surveyQuestionIndex: fieldIdx, updatedAt: new Date() })
        .where(eq(leads.id, lead.id))
      lead = { ...lead, surveyQuestionIndex: fieldIdx }
    }
    await persistSurveyFieldAndAdvance(lead, yes.field, yes.canonical, correlationId)
    return true
  }

  const noField = parseGeoConfirmNo(callbackData)
  if (noField) {
    await sendText(lead, 'Ok, escríbelo de nuevo por favor.')
    const fieldIdx = questionIndexForField(noField as Parameters<typeof questionIndexForField>[0])
    await sendSurveyQuestion(lead, fieldIdx, lead.id)
    return true
  }

  return false
}

export { askGeoConfirmation }
export type { GeoField }
