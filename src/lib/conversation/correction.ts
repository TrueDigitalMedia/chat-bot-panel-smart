import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates, leads, surveyProfiles } from '@/lib/db/schema'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { SURVEY_FIELDS, type Lead, type SurveyFieldName } from '@/types/lead'
import {
  FIELD_LABELS,
  cascadeClearFields,
  questionIndexForField,
  CORRECT_MENU,
  CORRECT_CANCEL,
} from './correction-fields'
import { captureSurveyFieldValue } from './survey-capture'
import { sendSurveyQuestion } from './send-survey-question'
import { SURVEY_QUESTIONS } from './survey-questions'
import type { InlineKeyboardButton } from '@/types/telegram'

export { CORRECT_MENU, CORRECT_CANCEL } from './correction-fields'

export function isCorrectionCallback(data: string | undefined): boolean {
  return !!data && (data === CORRECT_MENU || data === CORRECT_CANCEL || data.startsWith('correct:field:'))
}

function filledFields(profile: Record<string, unknown>): SurveyFieldName[] {
  return SURVEY_FIELDS.filter((f) => {
    const v = profile[f]
    if (v === null || v === undefined) return false
    if (typeof v === 'string' && v.trim() === '') return false
    if (Array.isArray(v) && v.length === 0) return false
    return true
  })
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export async function showCorrectionMenu(lead: Lead): Promise<void> {
  const [profile] = await db
    .select()
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, lead.id))
    .limit(1)

  if (!profile) {
    await sendText(lead, 'Aún no hay respuestas para corregir.')
    return
  }

  const fields = filledFields(profile as unknown as Record<string, unknown>)
  if (fields.length === 0) {
    await sendText(lead, 'Aún no hay respuestas para corregir.')
    return
  }

  const profileRec = profile as unknown as Record<string, unknown>
  const buttons: InlineKeyboardButton[][] = []
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]!
    const current = formatValue(profileRec[field])
    const label = `${FIELD_LABELS[field]}: ${current}`.slice(0, 64)
    buttons.push([{ text: label, callback_data: `correct:field:${field}` }])
  }
  buttons.push([{ text: 'Cancelar', callback_data: CORRECT_CANCEL }])

  await sendInlineKeyboard(
    lead,
    'Elige la pregunta que quieres corregir. Continuaremos el flujo desde ahí.',
    buttons,
  )
}

/**
 * Clear the selected answer (+ geo dependents) and restart the survey from that question.
 */
export async function restartSurveyFromField(lead: Lead, field: SurveyFieldName): Promise<void> {
  const [profile] = await db
    .select()
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, lead.id))
    .limit(1)

  const filled = profile
    ? filledFields(profile as unknown as Record<string, unknown>)
    : []
  if (!filled.includes(field)) {
    await sendText(
      lead,
      `Todavía no tienes una respuesta de “${FIELD_LABELS[field]}” para corregir.`,
    )
    return
  }

  const cascade = cascadeClearFields(field)
  const patch: Record<string, unknown> = { [field]: null }
  for (const f of cascade) patch[f] = null

  const idx = questionIndexForField(field)
  const now = new Date()

  await db.update(surveyProfiles).set(patch).where(eq(surveyProfiles.leadId, lead.id))
  await db
    .update(leads)
    .set({ surveyQuestionIndex: idx, updatedAt: now })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({
      surveyQuestionIndex: idx,
      isCorrecting: false,
      correctingField: null,
      correctionResumeIndex: null,
      updatedAt: now,
    })
    .where(eq(flowStates.leadId, lead.id))

  let msg = `Ok, volvamos a *${FIELD_LABELS[field]}*.`
  if (cascade.length > 0) {
    msg += `\nTambién limpio: ${cascade.map((f) => FIELD_LABELS[f]).join(', ')} (los volverás a completar).`
  }
  await sendText(lead, msg)
  await sendSurveyQuestion(lead, idx, lead.id)
}

export async function cancelCorrection(lead: Lead): Promise<void> {
  await db
    .update(flowStates)
    .set({
      isCorrecting: false,
      correctingField: null,
      correctionResumeIndex: null,
      updatedAt: new Date(),
    })
    .where(eq(flowStates.leadId, lead.id))

  await sendText(lead, 'Corrección cancelada. Seguimos donde íbamos.')
  const idx = lead.surveyQuestionIndex
  if (idx >= 1 && idx <= 16) {
    await sendSurveyQuestion(lead, idx, lead.id)
  }
}

/**
 * One-shot NL update ("cambia el email a x"): save value and continue from the next needed question.
 */
export async function applyFieldAndContinue(
  lead: Lead,
  field: SurveyFieldName,
  value: unknown,
): Promise<void> {
  const cascade = cascadeClearFields(field)
  const patch: Record<string, unknown> = { [field]: value }
  for (const f of cascade) patch[f] = null

  const fieldIdx = questionIndexForField(field)
  const nextIdx =
    cascade.length > 0 ? questionIndexForField(cascade[0]!) : Math.min(fieldIdx + 1, 16)
  const now = new Date()

  await db.update(surveyProfiles).set(patch).where(eq(surveyProfiles.leadId, lead.id))
  await db
    .update(leads)
    .set({ surveyQuestionIndex: nextIdx, updatedAt: now })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({
      surveyQuestionIndex: nextIdx,
      isCorrecting: false,
      correctingField: null,
      correctionResumeIndex: null,
      updatedAt: now,
    })
    .where(eq(flowStates.leadId, lead.id))

  let msg = `✅ Actualicé *${FIELD_LABELS[field]}* a: ${formatValue(value)}.`
  if (cascade.length > 0) {
    msg += `\nTambién limpio: ${cascade.map((f) => FIELD_LABELS[f]).join(', ')}.`
  }
  await sendText(lead, msg)
  await sendText(lead, 'Continuamos desde aquí:')
  await sendSurveyQuestion(lead, nextIdx, lead.id)
}

/** @deprecated alias — geo confirm / legacy callers */
export async function applyFieldCorrection(
  lead: Lead,
  field: SurveyFieldName,
  value: unknown,
): Promise<void> {
  await applyFieldAndContinue(lead, field, value)
}

/**
 * Handle correction callbacks (menu / field pick / cancel).
 */
export async function handleCorrectionFlow(
  lead: Lead,
  _messageText: string,
  callbackData: string | undefined,
): Promise<boolean> {
  if (!lead.d3IsShopper || lead.surveyQuestionIndex < 1) return false
  if (!callbackData) return false

  if (callbackData === CORRECT_MENU) {
    await showCorrectionMenu(lead)
    return true
  }
  if (callbackData === CORRECT_CANCEL) {
    await cancelCorrection(lead)
    return true
  }
  if (callbackData.startsWith('correct:field:')) {
    const field = callbackData.slice('correct:field:'.length) as SurveyFieldName
    if (!(SURVEY_FIELDS as readonly string[]).includes(field)) {
      await sendText(lead, 'Campo no válido.')
      return true
    }
    await restartSurveyFromField(lead, field)
    return true
  }

  return false
}

/**
 * NL: user asks to correct → menu of answered questions, or one-shot field update.
 */
export async function handleCorrectionIntent(
  lead: Lead,
  messageText: string,
): Promise<boolean> {
  if (!lead.d3IsShopper || lead.surveyQuestionIndex < 1) return false
  if (!messageText.trim()) return false

  const { detectCorrectionIntent } = await import('./detect-correction-intent')
  const intent = detectCorrectionIntent(messageText)
  if (intent.kind === 'none') return false

  if (intent.kind === 'open_menu') {
    await showCorrectionMenu(lead)
    return true
  }

  // correct_field
  if (intent.value) {
    const q = SURVEY_QUESTIONS.find((x) => x.fieldName === intent.field)
    if (q?.inputType === 'button') {
      await restartSurveyFromField(lead, intent.field)
      return true
    }
    const captured = await captureSurveyFieldValue(lead.id, intent.field, intent.value, undefined)
    if (!captured.ok) {
      await sendText(lead, captured.message)
      await restartSurveyFromField(lead, intent.field)
      return true
    }
    if (captured.needsConfirmation && typeof captured.value === 'string') {
      // Restart on that geo question so confirmation + normal flow apply
      await restartSurveyFromField(lead, intent.field)
      const { askGeoConfirmation } = await import('@/lib/geo/confirm')
      await askGeoConfirmation(
        lead,
        intent.field as 'stateProvince' | 'municipality' | 'neighborhood',
        captured.value,
      )
      return true
    }
    await applyFieldAndContinue(lead, intent.field, captured.value)
    return true
  }

  await restartSurveyFromField(lead, intent.field)
  return true
}
