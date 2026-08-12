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
import { SURVEY_QUESTIONS, SURVEY_QUESTION_COUNT } from './survey-questions'
import { generateCorrelationId } from '@/lib/correlation'
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
 * The redone answer itself is persisted later by phase-1.ts's normal per-question capture
 * path (same code as a first-time answer — flowStates.isCorrecting/correctingField are
 * reset here, not consulted there), which will resync to Panel Smart at the next phase
 * transition (transitionLead). A correction made after every phase is already complete,
 * with no further transition ever firing, won't resync until another one does — a known
 * gap, left as-is rather than adding correction-awareness to phase-1.ts's shared capture
 * code (see panel-smart/sync.ts).
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
  // Only worth resuming past the corrected question if the user had actually gotten
  // further ahead than it — correcting the question right in front of you needs no
  // special resume behavior, same as today.
  const resumeIdx = lead.surveyQuestionIndex > idx ? lead.surveyQuestionIndex : null

  await db.update(surveyProfiles).set(patch).where(eq(surveyProfiles.leadId, lead.id))
  await db
    .update(leads)
    .set({ surveyQuestionIndex: idx, updatedAt: now })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({
      surveyQuestionIndex: idx,
      isCorrecting: resumeIdx !== null,
      correctingField: resumeIdx !== null ? field : null,
      correctionResumeIndex: resumeIdx,
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
  if (idx >= 1 && idx <= SURVEY_QUESTION_COUNT) {
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
    cascade.length > 0 ? questionIndexForField(cascade[0]!) : Math.min(fieldIdx + 1, SURVEY_QUESTION_COUNT)
  const now = new Date()
  const resumeIdx = lead.surveyQuestionIndex > nextIdx ? lead.surveyQuestionIndex : null

  await db.update(surveyProfiles).set(patch).where(eq(surveyProfiles.leadId, lead.id))
  await db
    .update(leads)
    .set({ surveyQuestionIndex: nextIdx, updatedAt: now })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({
      surveyQuestionIndex: nextIdx,
      isCorrecting: resumeIdx !== null,
      correctingField: resumeIdx !== null ? field : null,
      correctionResumeIndex: resumeIdx,
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

  // Fire-and-forget: resync the corrected answer to Panel Smart right away, since a
  // one-shot NL correction ("cambia el email a x") doesn't necessarily trigger a status
  // transition (the usual sync hook in transitionLead).
  void import('@/lib/panel-smart/sync')
    .then(({ syncPendingPanelSmartAnswers }) =>
      syncPendingPanelSmartAnswers(lead.id, generateCorrelationId(), { trigger: 'correction' }),
    )
    .catch((err) => {
      console.error('[panel-smart-sync] correction sync failed', { leadId: lead.id, field, err: String(err) })
    })
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
 * Called right after phase-1.ts persists an answer and advances surveyQuestionIndex.
 * If the lead is mid-correction (flow_states.is_correcting), skips forward past any
 * question that's already answered (not cleared by the correction's cascade) instead of
 * re-asking it, until either hitting a genuinely empty field (correction stays in
 * progress, caller proceeds with the returned index as normal) or catching up to
 * correction_resume_index — the question the user was on when they asked to correct —
 * at which point the correction flags are cleared and the survey resumes there exactly,
 * instead of forcing the user to redo everything after the corrected field.
 */
export async function resumeAfterCorrection(leadId: string, nextIdx: number): Promise<number> {
  const [state] = await db
    .select({ isCorrecting: flowStates.isCorrecting, correctionResumeIndex: flowStates.correctionResumeIndex })
    .from(flowStates)
    .where(eq(flowStates.leadId, leadId))
    .limit(1)

  if (!state?.isCorrecting || !state.correctionResumeIndex) return nextIdx
  const resumeIdx = state.correctionResumeIndex

  const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, leadId)).limit(1)
  const rec = (profile ?? {}) as Record<string, unknown>

  let idx = nextIdx
  while (idx < resumeIdx && idx <= SURVEY_QUESTION_COUNT) {
    const q = SURVEY_QUESTIONS[idx - 1]
    const v = q ? rec[q.fieldName] : undefined
    const filled = v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')
    if (!filled) return idx // gap to fill — correction stays in progress as-is
    idx += 1
  }

  // Caught up to (or reached) the resume point — correction complete.
  idx = Math.min(idx, resumeIdx)
  const now = new Date()
  await db.update(leads).set({ surveyQuestionIndex: idx, updatedAt: now }).where(eq(leads.id, leadId))
  await db
    .update(flowStates)
    .set({
      surveyQuestionIndex: idx,
      isCorrecting: false,
      correctingField: null,
      correctionResumeIndex: null,
      updatedAt: now,
    })
    .where(eq(flowStates.leadId, leadId))
  return idx
}

async function getFilledFieldsSummary(
  leadId: string,
): Promise<{ field: SurveyFieldName; label: string; value: string }[]> {
  const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, leadId)).limit(1)
  if (!profile) return []
  const rec = profile as unknown as Record<string, unknown>
  return filledFields(rec).map((f) => ({ field: f, label: FIELD_LABELS[f], value: formatValue(rec[f]) }))
}

/**
 * NL: user asks to correct → menu of answered questions, one-shot field update, or (via
 * the AI fallback below) a loosely-phrased request the regex can't parse — "seleccione
 * mal el pais, puedo corregirlo" — or a field this system can't correct at all, like the
 * phone number ("unsupported_field"), which gets an explicit message instead of being
 * silently ignored or mistaken for something else.
 *
 * Only requires d3IsShopper (not surveyQuestionIndex >= 1 like the old gate) so this can
 * also be called from the phone-capture/GPS-capture gates that run before the survey
 * proper starts — there it'll usually only have something to act on once at least one
 * survey field (e.g. fullName) is already filled.
 *
 * `useAIFallback` defaults to true, but callers that run this check on EVERY turn before
 * even trying to resolve the message as a normal answer (flow-router's pre-check ahead
 * of handlePhase1) must pass `false` — otherwise the AI classifier would fire on nearly
 * every ordinary free-text survey answer, not just as a last resort. Callers that only
 * reach this after normal answer-resolution (button match, AI button interpretation,
 * field extraction) has already failed should leave it at the default.
 */
export async function tryHandleCorrectionRequest(
  lead: Lead,
  messageText: string,
  correlationId: string,
  pendingQuestionText: string,
  opts: { useAIFallback?: boolean } = {},
): Promise<boolean> {
  if (!lead.d3IsShopper) return false
  if (!messageText.trim()) return false

  const { detectCorrectionIntent } = await import('./detect-correction-intent')
  const { detectCorrectionIntentAI } = await import('./detect-correction-intent-ai')
  let intent: Awaited<ReturnType<typeof detectCorrectionIntentAI>> = detectCorrectionIntent(messageText)

  if (intent.kind === 'none' && opts.useAIFallback !== false) {
    const filled = await getFilledFieldsSummary(lead.id)
    intent = await detectCorrectionIntentAI(messageText, filled, pendingQuestionText, {
      leadId: lead.id,
      correlationId,
    })
  }

  if (intent.kind === 'none') return false

  if (intent.kind === 'open_menu') {
    await showCorrectionMenu(lead)
    return true
  }

  if (intent.kind === 'unsupported_field') {
    await sendText(
      lead,
      `Por ahora no puedo corregir ${intent.label} por acá. Escribe "agente" si necesitás ayuda con eso.`,
    )
    return true
  }

  // correct_field — field is a validated SurveyFieldName by construction: the regex
  // path (detectCorrectionIntent) only ever resolves via resolveFieldAlias, and the AI
  // path (detectCorrectionIntentAI) only returns a field it was offered from
  // getFilledFieldsSummary above, i.e. already a SurveyFieldName.
  const field = intent.field as SurveyFieldName
  if (intent.value) {
    const q = SURVEY_QUESTIONS.find((x) => x.fieldName === field)
    if (q?.inputType === 'button') {
      await restartSurveyFromField(lead, field)
      return true
    }
    const captured = await captureSurveyFieldValue(lead.id, field, intent.value, undefined)
    if (!captured.ok) {
      await sendText(lead, captured.message)
      await restartSurveyFromField(lead, field)
      return true
    }
    if (captured.needsConfirmation && typeof captured.value === 'string') {
      // Restart on that geo question so confirmation + normal flow apply
      await restartSurveyFromField(lead, field)
      const { askGeoConfirmation } = await import('@/lib/geo/confirm')
      await askGeoConfirmation(
        lead,
        field as 'stateProvince' | 'municipality' | 'neighborhood',
        captured.value,
      )
      return true
    }
    await applyFieldAndContinue(lead, field, captured.value)
    return true
  }

  await restartSurveyFromField(lead, field)
  return true
}
