import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { surveyProfiles } from '@/lib/db/schema'
import { extractField } from '@/lib/ai/extract-survey-fields'
import { validateGuatemalaGeoField } from '@/lib/geo/guatemala'
import { BUTTON_FIELDS, FREE_TEXT_FIELDS, type SurveyFieldName } from '@/types/lead'
import { SURVEY_QUESTIONS } from './survey-questions'

export type CaptureResult =
  | { ok: true; value: unknown; needsConfirmation?: boolean }
  | { ok: false; message: string }

/**
 * Capture + validate a single survey field from user text or button callback.
 * Does not persist or advance the survey index.
 */
export async function captureSurveyFieldValue(
  leadId: string,
  field: SurveyFieldName,
  messageText: string,
  callbackData: string | undefined,
): Promise<CaptureResult> {
  const question = SURVEY_QUESTIONS.find((q) => q.fieldName === field)
  if (!question) return { ok: false, message: 'Campo no válido.' }

  if (BUTTON_FIELDS.has(field)) {
    if (!callbackData?.startsWith(`${field}:`)) {
      return { ok: false, message: 'Elige una opción de los botones, por favor.' }
    }
    const raw = callbackData.split(':').slice(1).join(':')
    const value = field === 'domesticHelp' ? raw === 'true' : raw
    return { ok: true, value }
  }

  if (!FREE_TEXT_FIELDS.has(field)) {
    return { ok: false, message: 'Campo no válido.' }
  }

  if (!messageText.trim()) {
    return { ok: false, message: 'Tuve un problema, ¿puedes repetirlo?' }
  }

  // shoppingCategories / numbers go through extractField
  const extractable = [
    'fullName',
    'stateProvince',
    'municipality',
    'neighborhood',
    'email',
    'householdSize',
    'bedrooms',
    'shoppingCategories',
  ] as const

  let value: unknown = messageText.trim()

  if ((extractable as readonly string[]).includes(field)) {
    const result = await extractField(field as Parameters<typeof extractField>[0], messageText, {
      leadId,
    })
    const isGeo =
      field === 'stateProvince' || field === 'municipality' || field === 'neighborhood'

    const [profile] = await db
      .select()
      .from(surveyProfiles)
      .where(eq(surveyProfiles.leadId, leadId))
      .limit(1)
    const isGuatemala = profile?.country === 'Guatemala'

    if (!result.ok) {
      if (isGeo && isGuatemala && messageText.trim().length >= 2) {
        value = messageText.trim()
      } else if (field === 'email' && /.+@.+\..+/.test(messageText.trim())) {
        value = messageText.trim()
      } else {
        return { ok: false, message: 'Tuve un problema, ¿puedes repetirlo?' }
      }
    } else {
      value = result.value
    }

    if (isGeo && isGuatemala) {
      const geo = validateGuatemalaGeoField(field, String(value ?? ''), {
        stateProvince: profile?.stateProvince,
        municipality: field === 'municipality' ? String(value) : profile?.municipality,
      })
      if (!geo.ok) {
        return { ok: false, message: geo.message ?? 'No pude validar esa ubicación.' }
      }
      value = geo.canonical ?? value
      if (geo.needsConfirmation) {
        return { ok: true, value, needsConfirmation: true }
      }
    }
  }

  return { ok: true, value }
}
