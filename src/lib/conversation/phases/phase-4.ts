import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles, fichaHogarProfiles } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendText, sendInlineKeyboard, sendVideo } from '@/lib/messaging/send'
import { supportRedirect, EXIT_A, NOT_UNDERSTOOD_MESSAGE } from '../exit-messages'
import type { Lead } from '@/types/lead'
import { FICHA_HOGAR_BUTTON_FIELDS } from '@/types/lead'
import { generateObject } from 'ai'
import { z } from 'zod'
import { boundContext } from '@/lib/ai/context-guard'
import { chatModel, CHAT_MODEL_ID } from '@/lib/ai/models'
import { extractField } from '@/lib/ai/extract-survey-fields'
import { logCall } from '@/lib/db/call-log'
import { generateCorrelationId } from '@/lib/correlation'
import { persistTreintaPanelist } from '@/lib/treinta/persist-panelist'
import { describeQuotaMatch } from '@/lib/scoring/quota'
import { FICHA_HOGAR_QUESTIONS, FICHA_HOGAR_QUESTION_COUNT } from '../ficha-hogar-questions'
import { matchButtonChoice } from '../match-button-choice'
import { interpretButtonAnswer } from '../interpret-button-answer'
import type { ChannelRecipient } from '@/types/channel'

const THANK_YOU_VIDEO = process.env.THANK_YOU_VIDEO_URL ?? ''

export async function sendFichaHogarQuestion(to: ChannelRecipient, index: number): Promise<void> {
  const q = FICHA_HOGAR_QUESTIONS[index - 1]
  if (!q) return
  if (q.inputType === 'button' && q.buttons) {
    await sendInlineKeyboard(to, q.text, q.buttons)
  } else {
    await sendText(to, q.text)
  }
}

async function getOrCreateFichaHogarProfile(leadId: string) {
  await db.insert(fichaHogarProfiles).values({ leadId }).onConflictDoNothing()
  const [profile] = await db
    .select()
    .from(fichaHogarProfiles)
    .where(eq(fichaHogarProfiles.leadId, leadId))
    .limit(1)
  return profile
}

/** Plausibility check for DD/MM/AAAA: not in the future, implies a reasonable age (0-120). */
export function isPlausibleBirthDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return false
  const [, dd, mm, yyyy] = match
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return false
  // JS Date silently rolls over out-of-range values (e.g. month 13 → next January) instead
  // of failing — verify the constructed date's components match the input to catch that.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false
  }
  if (date.getTime() > Date.now()) return false
  const ageYears = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  return ageYears >= 0 && ageYears <= 120
}

/**
 * Same purpose as phase-1.ts's maybeAnswerFaq — a button question can also get a
 * question typed at it instead of tapped, not just free-text fields.
 */
async function maybeAnswerFaq(
  lead: Lead,
  messageText: string,
  correlationId: string,
  pendingQuestionText: string,
): Promise<boolean> {
  if (!messageText.trim()) return false
  const { tryAnswerFaqOnExtractionFailure } = await import('../faq-handler')
  return tryAnswerFaqOnExtractionFailure(lead, messageText, correlationId, pendingQuestionText)
}

/**
 * Ficha Hogar entry point + continuation handler — same dual role as handlePhase1.
 * Call with empty text/callbackData to send question 1 (from handlePhase3Success).
 */
export async function handleFichaHogar(
  lead: Lead,
  messageText: string,
  callbackData: string | undefined,
  correlationId: string,
): Promise<void> {
  const to = lead
  const profile = await getOrCreateFichaHogarProfile(lead.id)
  const idx = profile.questionIndex

  if (idx < 1) {
    await db
      .update(fichaHogarProfiles)
      .set({ questionIndex: 1, updatedAt: new Date() })
      .where(eq(fichaHogarProfiles.leadId, lead.id))
    await sendFichaHogarQuestion(to, 1)
    return
  }

  const question = FICHA_HOGAR_QUESTIONS[idx - 1]
  if (!question) return

  let fieldValue: unknown = null

  if (question.inputType === 'button') {
    let resolvedCallback = callbackData
    if (!resolvedCallback?.startsWith(`${question.fieldName}:`) && messageText.trim() && question.buttons) {
      // User typed instead of tapping (e.g. "si" for "Sí") — best-effort match against
      // this question's own button labels before giving up.
      const matched = matchButtonChoice(question.buttons, messageText)
      if (matched) resolvedCallback = matched
    }
    if (!resolvedCallback?.startsWith(`${question.fieldName}:`) && messageText.trim() && question.buttons) {
      const interpreted = await interpretButtonAnswer(question.buttons, messageText, question.text, {
        leadId: lead.id,
        correlationId,
      })
      if (interpreted) resolvedCallback = interpreted
    }
    if (!resolvedCallback?.startsWith(`${question.fieldName}:`)) {
      const { tryHandleFichaHogarCorrectionRequest } = await import('../ficha-hogar-correction')
      if (await tryHandleFichaHogarCorrectionRequest(lead, messageText, correlationId, question.text)) {
        return
      }
      const answered = await maybeAnswerFaq(lead, messageText, correlationId, question.text)
      if (!answered) await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendFichaHogarQuestion(to, idx)
      return
    }
    const raw = resolvedCallback.split(':').slice(1).join(':')
    fieldValue =
      FICHA_HOGAR_BUTTON_FIELDS.has(question.fieldName) && (raw === 'true' || raw === 'false')
        ? raw === 'true'
        : raw
  } else {
    if (!messageText.trim()) {
      await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendFichaHogarQuestion(to, idx)
      return
    }
    const result = await extractField(
      question.fieldName as Parameters<typeof extractField>[0],
      messageText,
      { leadId: lead.id },
    )
    if (!result.ok) {
      const { tryHandleFichaHogarCorrectionRequest } = await import('../ficha-hogar-correction')
      if (await tryHandleFichaHogarCorrectionRequest(lead, messageText, correlationId, question.text)) {
        return
      }
      const { tryAnswerFaqOnExtractionFailure } = await import('../faq-handler')
      const answered = await tryAnswerFaqOnExtractionFailure(lead, messageText, correlationId, question.text)
      if (!answered) {
        await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      }
      await sendFichaHogarQuestion(to, idx)
      return
    }
    fieldValue = result.value

    if (question.fieldName === 'dateOfBirth' && !isPlausibleBirthDate(String(fieldValue))) {
      await sendText(to, 'Esa fecha no parece válida. ¿Puedes escribirla de nuevo en formato DD/MM/AAAA?')
      await sendFichaHogarQuestion(to, idx)
      return
    }
  }

  // Q1 (conflictOfInterest) discard gate — before persisting/advancing further
  if (question.fieldName === 'conflictOfInterest' && fieldValue === true) {
    await db
      .update(fichaHogarProfiles)
      .set({ conflictOfInterest: true, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(fichaHogarProfiles.leadId, lead.id))
    // transitionLead syncs to Panel Smart as a side effect — runs after this update, so
    // it correctly picks up conflictOfInterest=true.
    await transitionLead(
      lead.id,
      'ficha_hogar_descartado',
      'ficha_hogar_conflict_of_interest',
      correlationId,
    )
    await sendText(to, EXIT_A)
    return
  }

  await db
    .update(fichaHogarProfiles)
    .set({ [question.fieldName]: fieldValue, updatedAt: new Date() } as Record<string, unknown>)
    .where(eq(fichaHogarProfiles.leadId, lead.id))

  const nextIdx = idx + 1
  await db
    .update(fichaHogarProfiles)
    .set({ questionIndex: nextIdx, updatedAt: new Date() })
    .where(eq(fichaHogarProfiles.leadId, lead.id))

  const { resumeFichaHogarAfterCorrection } = await import('../ficha-hogar-correction')
  const finalIdx = await resumeFichaHogarAfterCorrection(lead.id, nextIdx)

  if (finalIdx <= FICHA_HOGAR_QUESTION_COUNT) {
    await sendFichaHogarQuestion(to, finalIdx)
    return
  }

  await completeFichaHogar(lead, correlationId)
}

/**
 * Generates the AI summary, persists the panelist to Treinta, and marks Ficha Hogar
 * complete. Only reached after all FICHA_HOGAR_QUESTION_COUNT questions are answered —
 * the discard branch above returns before ever calling this.
 */
async function completeFichaHogar(lead: Lead, correlationId: string): Promise<void> {
  await db.update(leads).set({ currentPhase: 4, updatedAt: new Date() }).where(eq(leads.id, lead.id))
  await db
    .update(fichaHogarProfiles)
    .set({ completedAt: new Date() })
    .where(eq(fichaHogarProfiles.leadId, lead.id))

  const [surveyProfile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))
  const [fichaHogarProfile] = await db.select().from(fichaHogarProfiles).where(eq(fichaHogarProfiles.leadId, lead.id))
  const profile = { ...surveyProfile, ...fichaHogarProfile }

  const summaryCorrelationId = generateCorrelationId()
  const summaryPrompt = `Genera un resumen conciso del perfil del panelista basado en estos datos de la encuesta:\n${JSON.stringify(profile, null, 2)}`

  const context = boundContext([{ role: 'user', content: summaryPrompt }], 2000)

  const model = CHAT_MODEL_ID
  const start = Date.now()
  let summary: string | null = null

  try {
    const result = await generateObject({
      model: chatModel(),
      schema: z.object({ summary: z.string().max(1000) }),
      messages: context,
    })
    summary = result.object.summary
    await logCall({
      leadId: lead.id,
      callType: 'conversation_summary',
      model,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId: summaryCorrelationId,
    }).catch(() => {})
  } catch (err) {
    await logCall({
      leadId: lead.id,
      callType: 'conversation_summary',
      model,
      latencyMs: Date.now() - start,
      correlationId: summaryCorrelationId,
      error: String(err),
    }).catch(() => {})
  }

  const quotaReason = describeQuotaMatch(lead.quotaMatchedDimension, lead.quotaMatchedValue)
  if (quotaReason) {
    const reasonLine = `Motivo de calificación: ${quotaReason}.`
    summary = summary ? `${summary}\n\n${reasonLine}` : reasonLine
  }

  if (summary) {
    await db.update(leads).set({ conversationSummary: summary }).where(eq(leads.id, lead.id))
  }

  const persisted = await persistTreintaPanelist({
    leadId: lead.id,
    profile,
    summary,
    score: lead.score,
    quotaSegment: lead.quotaSegment,
  })

  if (!persisted) {
    await sendText(lead, supportRedirect())
    return
  }

  // transitionLead syncs to TDM MySQL as a side effect (spec 010 amendment) — runs after
  // conversationSummary is saved above, so thread_summary picks it up correctly.
  await transitionLead(lead.id, 'ficha_hogar_completada', 'phase4_complete', correlationId)

  await sendText(
    lead,
    '¡Listo! 🙌 Has completado tu registro. Muchas gracias por tu tiempo. Si en algún momento tienes dudas con la app, escríbeme "agente" y te pasamos un contacto.',
  )

  if (THANK_YOU_VIDEO) {
    await sendVideo(lead, THANK_YOU_VIDEO, '📹 Así registras tus compras en la app')
  }

  await sendText(lead, 'Gracias por tu interés y por el tiempo que has dedicado. 🙌')
}
