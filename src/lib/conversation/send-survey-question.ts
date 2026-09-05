import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { surveyProfiles, leads, flowStates } from '@/lib/db/schema'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { getCountryConfig } from '@/lib/countries/registry'
import { resolveSurveyQuestions, nextQuestionToSend } from './survey-plan'
import type { ChannelRecipient } from '@/types/channel'

/**
 * Send the survey question that should actually appear at (or after) `index`. This is the
 * single place the "skip a pre-answered field / a geo question this country doesn't ask"
 * rule lives (spec 016 T007) — `nextQuestionToSend` decides, and this function persists
 * the advanced `survey_question_index` (+ writes a skipped geo field null) exactly as the
 * pre-016 inline copies did. Callers pass the naive next index; this self-corrects.
 */
export async function sendSurveyQuestion(
  to: ChannelRecipient,
  index: number,
  leadId?: string,
): Promise<void> {
  let profile: { country: string | null } & Record<string, unknown> = { country: null }
  if (leadId) {
    const [row] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, leadId)).limit(1)
    if (row) profile = row as typeof profile
  }
  const country = profile.country ?? null
  const geo = getCountryConfig(country).geoHierarchy
  const questions = resolveSurveyQuestions(country)

  const { index: sendIndex, skipped } = nextQuestionToSend(questions, index, profile, geo)

  if (leadId && sendIndex !== index) {
    // A rule-2 (geo not asked) skip writes the geo field null — same as the old code;
    // a rule-1 (pre-answered) skip leaves the value in place.
    const geoNulls: Record<string, null> = {}
    for (const f of skipped) {
      if (f === 'stateProvince' || f === 'municipality' || f === 'neighborhood') geoNulls[f] = null
    }
    if (Object.keys(geoNulls).length > 0) {
      await db.update(surveyProfiles).set(geoNulls).where(eq(surveyProfiles.leadId, leadId))
    }
    await db.update(leads).set({ surveyQuestionIndex: sendIndex, updatedAt: new Date() }).where(eq(leads.id, leadId))
    await db
      .update(flowStates)
      .set({ surveyQuestionIndex: sendIndex, updatedAt: new Date() })
      .where(eq(flowStates.leadId, leadId))
  }

  const q = questions[sendIndex - 1]
  if (!q) return

  let text = q.text
  if (q.fieldName === 'stateProvince') {
    text = `¿En qué ${geo.stateProvinceLabel} vives?`
  } else if (q.fieldName === 'municipality') {
    text = `¿En qué ${geo.municipalityLabel} vives?`
  } else if (q.fieldName === 'neighborhood' && geo.neighborhoodLabel) {
    text = `¿En qué ${geo.neighborhoodLabel} vives?`
  }

  if (q.inputType === 'button' && q.buttons) {
    await sendInlineKeyboard(to, text, q.buttons)
  } else if (q.inputType === 'free_text') {
    await sendText(to, text)
  }
}
