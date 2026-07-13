import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { surveyProfiles } from '@/lib/db/schema'
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
    }
  }

  if (q.inputType === 'button' && q.buttons) {
    await sendInlineKeyboard(to, text, q.buttons)
  } else if (q.inputType === 'free_text') {
    await sendText(to, text)
  }
}
