import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates, leads } from '@/lib/db/schema'
import { sendPhoneRequest, confirmPhoneSaved, sendText } from '@/lib/messaging/send'
import { channelRequiresPhonePrompt, isBsuidChannelUserId, normalizePhone } from '@/lib/phone'
import { sendSurveyQuestion } from '@/lib/conversation/send-survey-question'
import type { Lead } from '@/types/lead'

/**
 * True when we still need the user to provide a phone before the survey.
 * WhatsApp normally auto-resolves from channel_user_id (resolveWhatsAppPhone, called
 * right before this in proceedAfterShopperYes) — but that can fail (BSUID instead of a
 * real phone, see channelRequiresPhonePrompt's comment), in which case phoneNumber is
 * still unset here and this correctly falls through to asking, same as telegram/web.
 */
export function needsPhoneCapture(lead: Lead): boolean {
  if (lead.phoneNumber) return false
  return channelRequiresPhonePrompt(lead.channel)
}

export async function resolveWhatsAppPhone(lead: Lead): Promise<Lead> {
  if (lead.channel !== 'whatsapp' || lead.phoneNumber) return lead
  // A BSUID ("DO.929750206851603") is not a phone number. Leaving phoneNumber unset lets
  // needsPhoneCapture fall through to asking the user, instead of normalizePhone mangling
  // the id into a bogus "+929750206851603" that then flows to TDM / Panel Smart.
  if (isBsuidChannelUserId(lead.channelUserId)) return lead
  const phone = normalizePhone(lead.channelUserId.startsWith('+') ? lead.channelUserId : `+${lead.channelUserId}`)
  if (!phone) return lead
  const [updated] = await db
    .update(leads)
    .set({ phoneNumber: phone, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
    .returning()
  return (updated as Lead) ?? { ...lead, phoneNumber: phone }
}

async function startSurvey(lead: Lead): Promise<void> {
  await db
    .update(leads)
    .set({ surveyQuestionIndex: 1, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({ decisionPoint: null, surveyQuestionIndex: 1, updatedAt: new Date() })
    .where(eq(flowStates.leadId, lead.id))
  await sendSurveyQuestion(lead, 1, lead.id)
}

/**
 * After D3 yes: ensure phone then open Q1.
 */
export async function proceedAfterShopperYes(lead: Lead): Promise<void> {
  lead = await resolveWhatsAppPhone(lead)

  if (needsPhoneCapture(lead)) {
    // Stay at survey index 0 until phone is captured
    await db
      .update(leads)
      .set({ surveyQuestionIndex: 0, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db
      .update(flowStates)
      .set({ decisionPoint: null, surveyQuestionIndex: 0, updatedAt: new Date() })
      .where(eq(flowStates.leadId, lead.id))
    await sendPhoneRequest(lead)
    return
  }

  await startSurvey(lead)
}

/**
 * Capture phone while waiting (telegram/web). Returns true if consumed.
 */
export async function handlePhoneCapture(
  lead: Lead,
  opts: { text?: string; contactPhone?: string; correlationId?: string },
): Promise<boolean> {
  if (!needsPhoneCapture(lead)) return false
  if (lead.d3IsShopper !== true) return false

  const raw = opts.contactPhone?.trim() || opts.text?.trim() || ''
  if (!raw) {
    await sendPhoneRequest(lead)
    return true
  }

  const phone = normalizePhone(raw)
  if (!phone) {
    // Could be a request to correct an earlier answer (e.g. their name) rather than a
    // malformed phone number — check before falling into the generic phone-retry path.
    const { tryHandleCorrectionRequest } = await import('./correction')
    if (
      await tryHandleCorrectionRequest(
        lead,
        raw,
        opts.correlationId ?? '',
        'Para continuar necesitamos tu número de teléfono.',
      )
    ) {
      return true
    }

    // A number-shaped typo and a question ("para que quieres mi numero") look the same
    // to normalizePhone — check FAQ/clarify first so a real question gets answered
    // instead of just the generic "no pude validar" retry every time.
    const { tryAnswerFaqOnExtractionFailure } = await import('./faq-handler')
    const answered = await tryAnswerFaqOnExtractionFailure(
      lead,
      raw,
      opts.correlationId ?? '',
      'Para continuar necesitamos tu número de teléfono.',
    )
    if (!answered) {
      await sendText(
        lead,
        'No pude validar ese número. Usa el botón «Compartir mi número» o escríbelo con código de país (ej. +50255551234).',
      )
    }
    await sendPhoneRequest(lead)
    return true
  }

  const [updated] = await db
    .update(leads)
    .set({ phoneNumber: phone, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
    .returning()

  const next = (updated as Lead) ?? { ...lead, phoneNumber: phone }
  await confirmPhoneSaved(next, phone)
  await startSurvey(next)
  return true
}
