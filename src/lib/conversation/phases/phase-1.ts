import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles, flowStates } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { extractField } from '@/lib/ai/extract-survey-fields'
import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'
import { checkQuotaAvailability } from '@/lib/scoring/quota'
import { hasSentOutboundMessage } from '@/lib/db/conversation-messages'
import { recordConsentEvent } from '@/lib/db/leads'
import { SURVEY_QUESTIONS, SURVEY_QUESTION_COUNT } from '../survey-questions'
import { EXIT_A, EXIT_B, EXIT_B_THANKS, NOT_UNDERSTOOD_MESSAGE } from '../exit-messages'
import {
  validateGuatemalaGeoField,
} from '@/lib/geo/guatemala'
import { validateCountryGeoField, isSupportedGeoCountry } from '@/lib/geo/country-catalog'
import { sendSurveyQuestion } from '../send-survey-question'
import { matchButtonChoice } from '../match-button-choice'
import { interpretButtonAnswer } from '../interpret-button-answer'
import { proceedAfterShopperYes, handlePhoneCapture, needsPhoneCapture } from '../phone-capture'
import { isMinorAge } from '../age-eligibility'
import type { Lead } from '@/types/lead'

import type { ChannelRecipient } from '@/types/channel'
import type { InlineKeyboardButton } from '@/types/telegram'

const TNC_LINK = 'https://www.panelsmart-cenam.com/terminos-y-condiciones'

const GREETING_TEXT =
  '¡Hola! Soy el asistente virtual de PanelSmart 🙂\n\nTe invitamos a unirte a nuestro panel de encuestas y ganar premios por compartir tu opinión.\n\nAl responder SÍ, aceptás recibir encuestas y notificaciones de PanelSmart por este canal. Podés darte de baja en cualquier momento respondiendo STOP.\n\n¿Querés inscribirte?'
const OPT_IN_TEXT = '¿Querés inscribirte?'
const D1_TEXT = `✅ Antes de continuar, revisá nuestros Términos y Condiciones del programa:\n\n${TNC_LINK}\n\n¿Confirmás que los leíste y aceptás participar?`
const REENGAGEMENT_CONSENT_TEXT =
  '📋 Para mejorar tu experiencia, nos gustaría poder contactarte si dejás el registro a mitad del proceso.\n\n¿Autorizás que te contactemos en ese caso?\n\nPodés revocar este permiso en cualquier momento respondiendo STOP.'
const D3_TEXT = '¿Eres quién administra y organiza las compras del hogar?'

// Decision-gate button layouts — shared between the send* helpers below and
// resolveGateDecision, which needs the actual button labels to fuzzy-match free text.
const OPT_IN_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: 'Inscribirme', callback_data: 'optin:accept' },
    { text: 'No', callback_data: 'optin:decline' },
  ],
]
const D1_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: 'Confirmo y acepto', callback_data: 'd1:accept' },
    { text: 'No, gracias', callback_data: 'd1:decline' },
  ],
]
const REENGAGEMENT_CONSENT_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: 'Sí, autorizo', callback_data: 'reengagement_consent:accept' },
    { text: 'No, gracias', callback_data: 'reengagement_consent:decline' },
  ],
]
const D3_BUTTONS: InlineKeyboardButton[][] = [
  [
    { text: 'Sí', callback_data: 'd3:yes' },
    { text: 'No', callback_data: 'd3:no' },
  ],
]

/**
 * These two show quick-pick number buttons (1-6) but the underlying columns are
 * plain integers with no real upper bound (household size, bedroom count), so a
 * typed number outside the button range still has to work.
 */
const NUMERIC_BUTTON_FIELDS = new Set(['householdSize', 'bedrooms'])

/**
 * Decision-point gates (opt-in/D1/D2/D3) only ever expect a button tap — free text
 * that doesn't match one might be a question ("¿de qué sirve esto?") rather than
 * junk. Checks FAQ before the caller re-shows the same gate; no-ops on empty text
 * (e.g. the very first bootstrap message, which has none to check).
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
 * Resolves a decision-gate turn to 'accept'/'decline' when the tap itself didn't
 * already say so — matchButtonChoice first (cheap, handles "1"/"2" or an exact/short
 * label like "sí"/"no"), then interpretButtonAnswer (AI) for everything else (e.g.
 * "acepto", "no quiero", "dale"), since these buttons' labels are multi-word phrases
 * ("Confirmo y acepto") that free text rarely repeats verbatim. Returns null — no
 * accept/decline signal found — for empty text, real questions, or noise, so the
 * caller falls through to its existing FAQ-then-reask behavior.
 */
async function resolveGateDecision(
  buttons: InlineKeyboardButton[][],
  messageText: string,
  callbackData: string | undefined,
  acceptCallback: string,
  declineCallback: string,
  pendingQuestionText: string,
  correlationId: string,
  leadId: string,
): Promise<'accept' | 'decline' | null> {
  if (callbackData === acceptCallback) return 'accept'
  if (callbackData === declineCallback) return 'decline'
  if (!messageText.trim()) return null

  const matched = matchButtonChoice(buttons, messageText)
  if (matched === acceptCallback) return 'accept'
  if (matched === declineCallback) return 'decline'

  const interpreted = await interpretButtonAnswer(buttons, messageText, pendingQuestionText, { leadId, correlationId })
  if (interpreted === acceptCallback) return 'accept'
  if (interpreted === declineCallback) return 'decline'
  return null
}

// Handle Phase 1: opt-in gate, decision points D1→D3, then the survey (SURVEY_QUESTION_COUNT questions)
export async function handlePhase1(
  lead: Lead,
  messageText: string,
  callbackData: string | undefined,
  correlationId: string,
): Promise<void> {
  const to = lead

  // --- DECISION POINTS ---

  // Opt-in: initial enrollment gate, before D1 (spec 007)
  if (!lead.optInAccepted) {
    const decision = await resolveGateDecision(
      OPT_IN_BUTTONS,
      messageText,
      callbackData,
      'optin:accept',
      'optin:decline',
      OPT_IN_TEXT,
      correlationId,
      lead.id,
    )
    if (decision === 'accept') {
      await db.update(leads).set({ optInAccepted: true, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await recordConsentEvent(lead.id, 'opt_in', lead.channel, true, GREETING_TEXT, messageText)
      await sendD1(to)
    } else if (decision === 'decline') {
      await recordConsentEvent(lead.id, 'opt_in', lead.channel, false, GREETING_TEXT, messageText)
      await transitionLead(lead.id, 'not_qualified', 'opt_in_decline', correlationId)
      await sendText(to, EXIT_A)
    } else if (!(await hasSentOutboundMessage(lead.id))) {
      // Conversation opener goes out once, before anything else the bot ever sends —
      // combines the greeting and the opt-in question into a single message with buttons.
      await sendInlineKeyboard(to, GREETING_TEXT, OPT_IN_BUTTONS)
    } else {
      // Free text that isn't a button tap might be a question ("¿de qué sirve esto?")
      // rather than junk — answer it via FAQ before re-showing the same gate.
      const answered = await maybeAnswerFaq(lead, messageText, correlationId, OPT_IN_TEXT)
      if (!answered) await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendOptIn(to)
    }
    return
  }

  // D1: T&C
  if (!lead.d1Accepted) {
    const decision = await resolveGateDecision(
      D1_BUTTONS,
      messageText,
      callbackData,
      'd1:accept',
      'd1:decline',
      D1_TEXT,
      correlationId,
      lead.id,
    )
    if (decision === 'accept') {
      await db.update(leads).set({ d1Accepted: true, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await recordConsentEvent(lead.id, 'terms', lead.channel, true, D1_TEXT, messageText)
      await sendReEngagementConsent(to)
    } else if (decision === 'decline') {
      await recordConsentEvent(lead.id, 'terms', lead.channel, false, D1_TEXT, messageText)
      await transitionLead(lead.id, 'not_qualified', 'd1_decline', correlationId)
      await sendText(to, EXIT_A)
    } else {
      const answered = await maybeAnswerFaq(lead, messageText, correlationId, D1_TEXT)
      if (!answered) await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendD1(to)
    }
    return
  }

  // Re-engagement consent: ask for permission to contact if abandons
  if (lead.reEngagementConsentAccepted === null) {
    const decision = await resolveGateDecision(
      REENGAGEMENT_CONSENT_BUTTONS,
      messageText,
      callbackData,
      'reengagement_consent:accept',
      'reengagement_consent:decline',
      REENGAGEMENT_CONSENT_TEXT,
      correlationId,
      lead.id,
    )
    if (decision === 'accept') {
      await db.update(leads).set({ reEngagementConsentAccepted: true, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await recordConsentEvent(lead.id, 're_engagement', lead.channel, true, REENGAGEMENT_CONSENT_TEXT, messageText)
      await sendD3(to)
    } else if (decision === 'decline') {
      await db.update(leads).set({ reEngagementConsentAccepted: false, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await recordConsentEvent(lead.id, 're_engagement', lead.channel, false, REENGAGEMENT_CONSENT_TEXT, messageText)
      await sendD3(to)
    } else {
      const answered = await maybeAnswerFaq(lead, messageText, correlationId, REENGAGEMENT_CONSENT_TEXT)
      if (!answered) await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendReEngagementConsent(to)
    }
    return
  }

  // D3: Is shopper
  if (lead.d3IsShopper === null) {
    const decision = await resolveGateDecision(
      D3_BUTTONS,
      messageText,
      callbackData,
      'd3:yes',
      'd3:no',
      D3_TEXT,
      correlationId,
      lead.id,
    )
    if (decision === 'accept') {
      await db
        .update(leads)
        .set({ d3IsShopper: true, surveyQuestionIndex: 0, updatedAt: new Date() })
        .where(eq(leads.id, lead.id))
      const updated = { ...lead, d3IsShopper: true, surveyQuestionIndex: 0 }
      await proceedAfterShopperYes(updated)
    } else if (decision === 'decline') {
      await db.update(leads).set({ d3IsShopper: false, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await transitionLead(lead.id, 'quota_exhausted', 'd3_no', correlationId)
      await sendText(to, EXIT_B)
    } else {
      const answered = await maybeAnswerFaq(lead, messageText, correlationId, D3_TEXT)
      if (!answered) await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendD3(to)
    }
    return
  }

  // Phone gate (telegram / web) before survey Q1
  if (needsPhoneCapture(lead)) {
    await handlePhoneCapture(lead, { text: messageText, correlationId })
    return
  }

  // --- SURVEY QUESTIONS ---
  // Defensive: D3 passed but index never synced on leads (legacy stuck sessions)
  let idx = lead.surveyQuestionIndex
  if (lead.d3IsShopper === true && idx < 1) {
    idx = 1
    await db
      .update(leads)
      .set({ surveyQuestionIndex: 1, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
  }
  if (idx < 1 || idx > SURVEY_QUESTION_COUNT) {
    console.warn('[phase-1] survey index out of range', { leadId: lead.id, idx })
    return
  }

  const question = SURVEY_QUESTIONS[idx - 1]
  if (!question) return

  let fieldValue: unknown = null

  if (question.inputType === 'button') {
    // Extract value from callback data: format "fieldName:value"
    let resolvedCallback = callbackData
    if (!resolvedCallback?.startsWith(`${question.fieldName}:`) && messageText.trim() && question.buttons) {
      // User typed instead of tapping (e.g. "si" for "Sí") — best-effort match against
      // this question's own button labels before giving up.
      const matched = matchButtonChoice(question.buttons, messageText)
      if (matched) resolvedCallback = matched
    }
    // householdSize/bedrooms only offer quick-pick buttons up to 6 — a typed answer
    // outside that range (digits or spelled out, e.g. "siete") still needs to go
    // through the same AI extraction path free-text fields use, so it skips the
    // button-interpretation step below (which can only ever resolve to one of the
    // 1-6 button values anyway, never a number outside that range).
    const isUnresolvedNumericTyped =
      !resolvedCallback?.startsWith(`${question.fieldName}:`) &&
      NUMERIC_BUTTON_FIELDS.has(question.fieldName)
    if (
      !resolvedCallback?.startsWith(`${question.fieldName}:`) &&
      messageText.trim() &&
      question.buttons &&
      !isUnresolvedNumericTyped
    ) {
      const interpreted = await interpretButtonAnswer(question.buttons, messageText, question.text, {
        leadId: lead.id,
        correlationId,
      })
      if (interpreted) resolvedCallback = interpreted
    }
    if (!resolvedCallback?.startsWith(`${question.fieldName}:`)) {
      if (isUnresolvedNumericTyped) {
        const result = await extractField(
          question.fieldName as 'householdSize' | 'bedrooms',
          messageText,
          { leadId: lead.id },
        )
        if (!result.ok) {
          await sendText(to, NOT_UNDERSTOOD_MESSAGE)
          await sendSurveyQuestion(to, idx, lead.id)
          return
        }
        fieldValue = result.value
      } else {
        const { tryHandleCorrectionRequest } = await import('../correction')
        if (await tryHandleCorrectionRequest(lead, messageText, correlationId, question.text)) {
          return
        }
        const answered = await maybeAnswerFaq(lead, messageText, correlationId, question.text)
        if (!answered) await sendText(to, NOT_UNDERSTOOD_MESSAGE)
        await sendSurveyQuestion(to, idx, lead.id)
        return
      }
    } else {
      const raw = resolvedCallback.split(':').slice(1).join(':')
      fieldValue =
        question.fieldName === 'domesticHelp'
          ? raw === 'true'
          : NUMERIC_BUTTON_FIELDS.has(question.fieldName)
            ? Number(raw)
            : raw
    }
  } else {
    // Free-text: ignore empty / stray button callbacks — just re-ask
    if (!messageText.trim()) {
      await sendText(to, NOT_UNDERSTOOD_MESSAGE)
      await sendSurveyQuestion(to, idx, lead.id)
      return
    }

    console.info('[phase-1] extracting field', {
      leadId: lead.id,
      field: question.fieldName,
      text: messageText.slice(0, 80),
    })
    const result = await extractField(
      question.fieldName as Parameters<typeof extractField>[0],
      messageText,
      { leadId: lead.id },
    )

    // If AI fails on geo fields with real validation data, fall back to raw text
    // and let geo validation decide.
    const isGeoField =
      question.fieldName === 'stateProvince' ||
      question.fieldName === 'municipality' ||
      question.fieldName === 'neighborhood'
    const isDeptOrMuni = question.fieldName === 'stateProvince' || question.fieldName === 'municipality'

    const [profileForCountry] = await db
      .select()
      .from(surveyProfiles)
      .where(eq(surveyProfiles.leadId, lead.id))
      .limit(1)
    const country = profileForCountry?.country ?? null
    const isGuatemala = country === 'Guatemala'
    // Guatemala validates all 3 geo fields (incl. zona/barrio); the other 6 countries
    // only have department/municipality data (data/geo/cam-nse-regions.json) — no
    // barrio-level catalog exists, so neighborhood there stays unvalidated free text.
    const hasGenericGeoValidation = isDeptOrMuni && country !== null && isSupportedGeoCountry(country)
    const hasGeoValidation = (isGeoField && isGuatemala) || hasGenericGeoValidation

    if (!result.ok) {
      // Check for a correction request BEFORE the geo raw-text fallback below — otherwise
      // something like "seleccione mal el pais, puedo corregirlo" typed at a geo question
      // would get forced through fuzzy department/municipality matching instead of ever
      // being recognized as wanting to fix an earlier answer.
      const { tryHandleCorrectionRequest } = await import('../correction')
      if (await tryHandleCorrectionRequest(lead, messageText, correlationId, question.text)) {
        return
      }
      if (hasGeoValidation && messageText.trim().length >= 2) {
        console.warn('[phase-1] extraction failed — using raw text for geo', {
          leadId: lead.id,
          field: question.fieldName,
        })
        fieldValue = messageText.trim()
      } else {
        console.warn('[phase-1] extraction failed', { leadId: lead.id, field: question.fieldName })
        const { tryAnswerFaqOnExtractionFailure } = await import('../faq-handler')
        const answered = await tryAnswerFaqOnExtractionFailure(lead, messageText, correlationId, question.text)
        if (!answered) {
          await sendText(to, NOT_UNDERSTOOD_MESSAGE)
        }
        await sendSurveyQuestion(to, idx, lead.id)
        return
      }
    } else {
      fieldValue = result.value
    }

    // Geo validation (departamento/provincia → municipio, + zona/barrio for Guatemala)
    if (hasGeoValidation) {
      const geo = isGuatemala
        ? validateGuatemalaGeoField(
            question.fieldName as 'stateProvince' | 'municipality' | 'neighborhood',
            String(fieldValue ?? ''),
            {
              stateProvince: profileForCountry?.stateProvince,
              municipality:
                question.fieldName === 'municipality'
                  ? String(fieldValue)
                  : profileForCountry?.municipality,
            },
          )
        : validateCountryGeoField(
            country!,
            question.fieldName as 'stateProvince' | 'municipality',
            String(fieldValue ?? ''),
            { stateProvince: profileForCountry?.stateProvince },
          )
      if (!geo.ok) {
        await sendText(
          to,
          geo.message ?? 'No pude validar esa ubicación. ¿Puedes intentar de nuevo?',
        )
        await sendSurveyQuestion(to, idx, lead.id)
        return
      }
      fieldValue = geo.canonical ?? fieldValue

      // Fuzzy/typo match → ask before saving (exact names skip confirmation)
      if (geo.needsConfirmation && geo.canonical) {
        const { askGeoConfirmation } = await import('@/lib/geo/confirm')
        await askGeoConfirmation(
          to,
          question.fieldName as 'stateProvince' | 'municipality' | 'neighborhood',
          geo.canonical,
        )
        return
      }
    }

    // Confirm municipality echo (Q4) — only after exact accept
    if (question.fieldName === 'municipality') {
      await sendText(to, `He entendido que tu municipio es ${fieldValue}.`)
    }
  }

  // Persist field and advance index
  await db
    .update(surveyProfiles)
    .set({ [question.fieldName]: fieldValue } as Record<string, unknown>)
    .where(eq(surveyProfiles.leadId, lead.id))

  // Minors don't qualify as panelists — checked right after age is captured, before
  // advancing to the next question.
  if (question.fieldName === 'age' && typeof fieldValue === 'number' && isMinorAge(fieldValue)) {
    await transitionLead(lead.id, 'not_qualified', 'age_minor', correlationId)
    await sendText(to, EXIT_A)
    return
  }

  // Manual path: NSE allowlist after municipality (before neighborhood)
  if (question.fieldName === 'municipality') {
    const [profile] = await db
      .select()
      .from(surveyProfiles)
      .where(eq(surveyProfiles.leadId, lead.id))
      .limit(1)
    if (profile?.country && profile.stateProvince) {
      const { applyManualMunicipalityAllowlist } = await import('../gps-capture')
      const fuzzyUsed = false // exact path here; fuzzy goes through geo confirm
      // A miss just means no NSE cell for quota attribution — checkQuotaAvailability
      // decides at survey end (still qualifies via the pregnancy/baby exception, if it
      // applies), so the survey always continues from here.
      await applyManualMunicipalityAllowlist(lead, {
        country: profile.country,
        stateProvince: profile.stateProvince,
        municipality: String(fieldValue),
        geoSource: fuzzyUsed ? 'text_fuzzy' : 'text_exact',
        correlationId,
      })
    }
  }

  const nextIdx = idx + 1
  await db
    .update(leads)
    .set({ surveyQuestionIndex: nextIdx, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({ surveyQuestionIndex: nextIdx, updatedAt: new Date() })
    .where(eq(flowStates.leadId, lead.id))

  // If this answer was part of correcting an earlier field, skip re-asking any question
  // already answered before, resuming exactly where the user was instead of redoing the
  // rest of the survey.
  const { resumeAfterCorrection } = await import('../correction')
  const finalIdx = await resumeAfterCorrection(lead.id, nextIdx)

  // Enter GPS gate before manual country questions
  if (finalIdx === 2) {
    const { requestGps } = await import('../gps-capture')
    await requestGps({ ...lead, surveyQuestionIndex: finalIdx })
    return
  }

  // Q5 (neighborhood) is hidden from every user — same "always null, skip to Q6" rule
  // as the GPS path (gps-capture.ts's applyAllowlistAfterConfirm).
  if (finalIdx === 5) {
    await db
      .update(surveyProfiles)
      .set({ neighborhood: null })
      .where(eq(surveyProfiles.leadId, lead.id))
    const skipIdx = 6
    await db.update(leads).set({ surveyQuestionIndex: skipIdx, updatedAt: new Date() }).where(eq(leads.id, lead.id))
    await db
      .update(flowStates)
      .set({ surveyQuestionIndex: skipIdx, updatedAt: new Date() })
      .where(eq(flowStates.leadId, lead.id))
    await sendSurveyQuestion(to, skipIdx, lead.id)
    return
  }

  if (finalIdx <= SURVEY_QUESTION_COUNT) {
    await sendSurveyQuestion(to, finalIdx, lead.id)
    return
  }

  // Survey complete — mark completed_at and score
  await db
    .update(surveyProfiles)
    .set({ completedAt: new Date() })
    .where(eq(surveyProfiles.leadId, lead.id))

  // Load scoring fields
  const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))
  const score = calculateScore({
    educationPsh: profile.educationPsh,
    cars: profile.cars,
    domesticHelp: profile.domesticHelp,
    householdSize: profile.householdSize,
    bedrooms: profile.bedrooms,
  })
  const segment = getQuotaSegment(score)

  await db.update(leads).set({ score, quotaSegment: segment, updatedAt: new Date() }).where(eq(leads.id, lead.id))

  const quotaDecision = await checkQuotaAvailability({
    country: profile.country ?? '',
    nseRegion: profile.nseRegion ?? '',
    segment,
    age: profile.age,
    householdSize: profile.householdSize,
    isPregnant: profile.isPregnant,
    hasBabyUnder3: profile.hasBabyUnder3,
    leadId: lead.id,
  })
  if (!quotaDecision.qualifies) {
    await transitionLead(lead.id, 'quota_exhausted', 'survey_complete_no_quota', correlationId)
    await sendText(to, EXIT_B)
    await sendText(to, EXIT_B_THANKS)
    return
  }

  await db
    .update(leads)
    .set({
      quotaMatchedDimension: quotaDecision.matchedDimension,
      quotaMatchedValue: quotaDecision.matchedValue,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id))

  // Advance to Phase 2
  await transitionLead(lead.id, 'link_sent', 'survey_complete_quota_available', correlationId)
  // Phase 2 handler will be called by the router on next tick
  const { handlePhase2 } = await import('./phase-2')
  await handlePhase2(lead, correlationId)
}

// --- Helpers ---

async function sendOptIn(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(to, OPT_IN_TEXT, OPT_IN_BUTTONS)
}

async function sendD1(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(to, D1_TEXT, D1_BUTTONS)
}

async function sendReEngagementConsent(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(to, REENGAGEMENT_CONSENT_TEXT, REENGAGEMENT_CONSENT_BUTTONS)
}

async function sendD3(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(to, D3_TEXT, D3_BUTTONS)
}

// Re-export for callers that still import from phase-1
export { sendSurveyQuestion } from '../send-survey-question'
