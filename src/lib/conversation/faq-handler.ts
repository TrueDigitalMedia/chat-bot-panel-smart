import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { findFaq } from '@/lib/rag/search'
import { validateBotResponse, SAFE_FALLBACK } from '@/lib/ai/validate-output'
import { supportRedirect } from './exit-messages'
import { isTerminal } from '@/lib/state-machine/transitions'
import { SURVEY_QUESTION_COUNT } from './survey-questions'
import type { Lead, LeadStatus } from '@/types/lead'
import type { ChannelRecipient } from '@/types/channel'

// Simple affirmatives/negatives and short responses that should never be FAQ-checked
const SKIP_PATTERNS = /^(sí|si|no|ok|okay|vale|entendido|listo|claro|gracias|perfecto|bien)$/i

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
    query.length > 15 &&
    !SKIP_PATTERNS.test(query.trim()) &&
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
    }
  }

  // Always re-send the pending question (FAQ match or not)
  await resendPendingQuestion(lead, pendingIdx, to)
}

/**
 * Called when free-text field extraction fails during a survey question (Fase 1 or
 * Ficha Hogar) — the strongest signal available that the message wasn't an answer at
 * all, e.g. the user asked something ("¿es gratis participar?") instead of giving
 * their name. Answers via FAQ if there's a match; the caller re-sends the pending
 * question itself either way (same as handleOutOfFlow), and falls back to its own
 * generic retry prompt only when this returns false.
 */
export async function tryAnswerFaqOnExtractionFailure(
  lead: Lead,
  query: string,
  correlationId: string,
): Promise<boolean> {
  const faqEntry = await findFaq(query, { leadId: lead.id, correlationId })
  if (!faqEntry) return false

  const answer = faqEntry.answer
  if (validateBotResponse(answer)) {
    await sendText(lead, answer)
  } else {
    await sendText(lead, SAFE_FALLBACK)
  }
  return true
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
  if (lead.d2Accepted === null) {
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
  if (questionIdx >= 1 && questionIdx <= SURVEY_QUESTION_COUNT) {
    const { sendSurveyQuestion } = await import('./send-survey-question')
    await sendSurveyQuestion(to, questionIdx, lead.id)
  }
}
