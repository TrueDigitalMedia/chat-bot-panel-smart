import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { surveyProfiles, leads, flowStates } from '@/lib/db/schema'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { getCountryConfig } from '@/lib/countries/registry'
import { resolveSurveyQuestions } from './survey-plan'
import type { ChannelRecipient } from '@/types/channel'

export async function sendSurveyQuestion(
  to: ChannelRecipient,
  index: number,
  leadId?: string,
): Promise<void> {
  let country: string | null = null
  if (leadId) {
    const [profile] = await db
      .select({ country: surveyProfiles.country })
      .from(surveyProfiles)
      .where(eq(surveyProfiles.leadId, leadId))
      .limit(1)
    country = profile?.country ?? null
  }

  const questions = resolveSurveyQuestions(country)
  const q = questions[index - 1]
  if (!q) return

  // TODO(016): this Q5-hidden backstop is a stopgap. Feature 016
  // (nextQuestionToSend) replaces it — and its copies in geo/handle-confirm.ts,
  // phases/phase-1.ts, and gps-capture.ts — with one shared send-time helper that
  // skips a geo question the country doesn't ask, without changing the resolved
  // list or its indices. Keep this minimal and easy to delete.
  if (q.fieldName === 'neighborhood' && getCountryConfig(country).geoHierarchy.neighborhoodLabel == null) {
    if (leadId) {
      await db.update(surveyProfiles).set({ neighborhood: null }).where(eq(surveyProfiles.leadId, leadId))
      await db.update(leads).set({ surveyQuestionIndex: index + 1, updatedAt: new Date() }).where(eq(leads.id, leadId))
      await db
        .update(flowStates)
        .set({ surveyQuestionIndex: index + 1, updatedAt: new Date() })
        .where(eq(flowStates.leadId, leadId))
    }
    await sendSurveyQuestion(to, index + 1, leadId)
    return
  }

  let text = q.text
  if (q.fieldName === 'stateProvince') {
    text = `¿En qué ${getCountryConfig(country).geoHierarchy.stateProvinceLabel} vives?`
  } else if (q.fieldName === 'municipality') {
    text = `¿En qué ${getCountryConfig(country).geoHierarchy.municipalityLabel} vives?`
  } else if (q.fieldName === 'neighborhood') {
    const label = getCountryConfig(country).geoHierarchy.neighborhoodLabel
    if (label) text = `¿En qué ${label} vives?`
  }

  if (q.inputType === 'button' && q.buttons) {
    await sendInlineKeyboard(to, text, q.buttons)
  } else if (q.inputType === 'free_text') {
    await sendText(to, text)
  }
}
