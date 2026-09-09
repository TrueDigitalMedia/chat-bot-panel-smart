import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates, surveyProfiles } from '@/lib/db/schema'
import { getRecentMessages } from '@/lib/db/conversation-messages'
import { sendText } from '@/lib/messaging/send'
import { findFaq } from '@/lib/rag/search'
import { answerClarification } from '@/lib/rag/clarify'
import { validateBotResponse, SAFE_FALLBACK } from '@/lib/ai/validate-output'
import { supportRedirect } from './exit-messages'
import { isTerminal } from '@/lib/state-machine/transitions'
import { surveyQuestionCount } from './survey-plan'
import type { Lead, LeadStatus } from '@/types/lead'
import type { ChannelRecipient } from '@/types/channel'

// Simple affirmatives/negatives and short responses that should never be FAQ-checked
const SKIP_PATTERNS = /^(sí|si|no|ok|okay|vale|entendido|listo|claro|gracias|perfecto|bien)$/i

/** True when `query` is substantial enough to be worth an FAQ/clarification LLM call.
 *  Shared by handleOutOfFlow and tryAnswerFaqOnExtractionFailure so neither burns a
 *  call (and risks an erratic clarification) on a stray typo, emoji, or gibberish
 *  that doesn't match a button's expected answer but isn't really asking anything —
 *  e.g. a nonsense reply to a plain Sí/No question like "¿Estás embarazada?". */
function isSubstantiveQuery(query: string): boolean {
  const trimmed = query.trim()
  return trimmed.length > 15 && !SKIP_PATTERNS.test(trimmed)
}

export async function handleOutOfFlow(
  lead: Lead,
  query: string,
  correlationId: string,
): Promise<void> {
  const to = lead
  const status = lead.leadStatus as LeadStatus

  // Terminal state → short support redirect
  if (isTerminal(status)) {
    await sendText(to, supportRedirect())
    return
  }

  // Get current pending question from flow state
  const [flowState] = await db.select().from(flowStates).where(eq(flowStates.leadId, lead.id))
  const pendingIdx = flowState?.surveyQuestionIndex ?? 0

  // Pre-filter: only attempt FAQ for substantive messages
  const shouldCheckFaq =
    isSubstantiveQuery(query) &&
    !query.startsWith('d1:') &&
    !query.startsWith('d2:') &&
    !query.startsWith('d3:') &&
    !query.startsWith('optin:')

  if (shouldCheckFaq) {
    const faqEntry = await findFaq(query, { leadId: lead.id, correlationId })
    if (faqEntry) {
      const answer = faqEntry.answer
      if (validateBotResponse(answer)) {
        await sendText(to, answer)
        await sendText(to, 'Continuemos donde lo dejamos 👉')
      } else {
        await sendText(to, SAFE_FALLBACK)
      }
    } else {
      // No FAQ match for a substantive message — ground a reply in the actual
      // conversation instead of staying silent and just re-asking the pending question.
      // Also the only place (besides the terminal/declined path in flow-router.ts) that
      // can catch "¿ya me registré?" while the lead is still active — e.g. mid-survey or
      // mid-Ficha Hogar — and actually close the conversation instead of looping the
      // pending step forever.
      const { generateFreeTextReply } = await import('./free-text-reply')
      const result = await generateFreeTextReply(lead.id, query, correlationId, {
        leadStatus: status,
        isDeclined: false,
      })
      if (result.intent === 'registration_status_check' && result.reply) {
        const { closeConversationForRegistrationStatusCheck } = await import('./flow-router')
        await closeConversationForRegistrationStatusCheck(lead, result.reply, correlationId)
        return
      }
      if (result.intent === 'needs_reply' && result.reply) {
        await sendText(to, result.reply)
      }
    }
  }

  // Always re-send the pending question (FAQ match or not) — unless the conversation was
  // just closed above (registration_status_check returns before reaching here).
  await resendPendingQuestion(lead, pendingIdx, to)
}

/**
 * Called when free-text field extraction fails during a survey question (Fase 1 or
 * Ficha Hogar) — the strongest signal available that the message wasn't an answer at
 * all, e.g. the user asked something ("¿es gratis participar?") instead of giving
 * their name. Answers via FAQ if there's a match; if no FAQ covers it, falls back to
 * an ad-hoc clarification grounded in the pending question text and recent history
 * (e.g. "para que es esta pregunta" won't match any seeded FAQ, but can still be
 * explained using the question that's actually pending). The caller re-sends the
 * pending question itself either way (same as handleOutOfFlow), and falls back to its
 * own generic retry prompt only when this returns false.
 */
export async function tryAnswerFaqOnExtractionFailure(
  lead: Lead,
  query: string,
  correlationId: string,
  pendingQuestionText: string,
): Promise<boolean> {
  if (!isSubstantiveQuery(query)) return false

  const faqEntry = await findFaq(query, { leadId: lead.id, correlationId, pendingQuestionText })
  if (faqEntry) {
    const answer = faqEntry.answer
    if (validateBotResponse(answer)) {
      await sendText(lead, answer)
    } else {
      await sendText(lead, SAFE_FALLBACK)
    }
    return true
  }

  const history = await getRecentMessages(lead.id)
  const clarification = await answerClarification(query, pendingQuestionText, history, {
    leadId: lead.id,
    correlationId,
  })
  if (clarification && validateBotResponse(clarification)) {
    await sendText(lead, clarification)
    return true
  }
  return false
}

async function resendPendingQuestion(
  lead: Lead,
  questionIdx: number,
  to: ChannelRecipient,
): Promise<void> {
  // Decision point phase
  if (!lead.d1Accepted) {
    const { sendSurveyQuestion: _ } = await import('./phases/phase-1')
    const { handlePhase1 } = await import('./phases/phase-1')
    await handlePhase1(lead, '', undefined, '')
    return
  }
  if (lead.d3IsShopper === null) {
    const { handlePhase1 } = await import('./phases/phase-1')
    await handlePhase1(lead, '', undefined, '')
    return
  }

  const { needsPhoneCapture, handlePhoneCapture } = await import('./phone-capture')
  if (needsPhoneCapture(lead)) {
    await handlePhoneCapture(lead, {})
    return
  }

  // Survey question
  const [faqCountryRow] = await db
    .select({ country: surveyProfiles.country })
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, lead.id))
    .limit(1)
  if (questionIdx >= 1 && questionIdx <= surveyQuestionCount(faqCountryRow?.country ?? null)) {
    const { sendSurveyQuestion } = await import('./send-survey-question')
    await sendSurveyQuestion(to, questionIdx, lead.id)
  }
}
