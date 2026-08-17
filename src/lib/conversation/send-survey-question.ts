import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { surveyProfiles, leads, flowStates } from '@/lib/db/schema'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { guatemalaQuestionText, type GeoField } from '@/lib/geo/guatemala'
import { SURVEY_QUESTIONS } from './survey-questions'
import type { ChannelRecipient } from '@/types/channel'

export async function sendSurveyQuestion(
  to: ChannelRecipient,
  index: number,
  leadId?: string,
): Promise<void> {
  const q = SURVEY_QUESTIONS[index - 1]
  if (!q) return

  // Q5 (neighborhood) is never shown to any user, no matter which caller reaches this
  // index or how — the definitive backstop, since every "advance to next question"
  // path lives in a different file (phase-1.ts, gps-capture.ts, handle-confirm.ts,
  // correction.ts's restartSurveyFromField/applyFieldAndContinue) and a new one could
  // always miss its own copy of this skip. Corrects the *persisted* survey index to
  // match what's actually sent (index+1), not just the displayed text, so the user's
  // next answer isn't misfiled into the hidden field.
  if (q.fieldName === 'neighborhood') {
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
  if (
    leadId &&
    (q.fieldName === 'stateProvince' ||
      q.fieldName === 'municipality' ||
      q.fieldName === 'neighborhood')
  ) {
    const [profile] = await db
      .select({ country: surveyProfiles.country })
      .from(surveyProfiles)
      .where(eq(surveyProfiles.leadId, leadId))
      .limit(1)
    if (profile?.country === 'Guatemala') {
      text = guatemalaQuestionText(q.fieldName as GeoField)
    } else if (profile?.country === 'Costa Rica' && q.fieldName === 'municipality') {
      // 'Cantón' is Costa Rica's actual term for this division — every other
      // country just gets the generic 'municipio' wording from survey-questions.ts.
      text = '¿En qué municipio o cantón vives?'
    }
  }

  if (q.inputType === 'button' && q.buttons) {
    await sendInlineKeyboard(to, text, q.buttons)
  } else if (q.inputType === 'free_text') {
    await sendText(to, text)
  }
}
