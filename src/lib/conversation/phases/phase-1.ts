import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles, flowStates } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { extractField } from '@/lib/ai/extract-survey-fields'
import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'
import { checkQuotaAvailability } from '@/lib/scoring/quota'
import { SURVEY_QUESTIONS, SURVEY_QUESTION_COUNT } from '../survey-questions'
import { EXIT_A, EXIT_B, EXIT_B_THANKS } from '../exit-messages'
import {
  validateGuatemalaGeoField,
} from '@/lib/geo/guatemala'
import { validateCountryGeoField, isSupportedGeoCountry } from '@/lib/geo/country-catalog'
import { sendSurveyQuestion } from '../send-survey-question'
import { matchButtonChoice } from '../match-button-choice'
import { proceedAfterShopperYes, handlePhoneCapture, needsPhoneCapture } from '../phone-capture'
import type { Lead } from '@/types/lead'

import type { ChannelRecipient } from '@/types/channel'

const TNC_LINK = 'https://upg-cd-ne.kantar.com/latin-america/cookies-y-politica-de-privacidad'

const OPT_IN_TEXT = '¿Te gustaría inscribirte en PanelSmart y comenzar a ganar premios?'
const D1_TEXT = `✅ Confirma que has leído y aceptas los Términos y Condiciones del programa 📄. Por favor, revísalos antes de continuar 🚀 en este link ${TNC_LINK}`
const D2_TEXT =
  'A continuación te haremos unas preguntas que nos ayudarán a clasificar tu hogar dentro del panel, y poder ganar premios más rápido.\n¿Quieres ganar premios por decirnos qué compras?'
const D3_TEXT = '¿Eres quién administra y organiza las compras del hogar?'

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
): Promise<void> {
  if (!messageText.trim()) return
  const { tryAnswerFaqOnExtractionFailure } = await import('../faq-handler')
  await tryAnswerFaqOnExtractionFailure(lead, messageText, correlationId, pendingQuestionText)
}

// Handle Phase 1: opt-in gate, decision points D1→D2→D3, then the survey (SURVEY_QUESTION_COUNT questions)
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
    if (callbackData === 'optin:accept') {
      await db.update(leads).set({ optInAccepted: true, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await sendD1(to)
    } else if (callbackData === 'optin:decline') {
      await transitionLead(lead.id, 'not_qualified', 'opt_in_decline', correlationId)
      await sendText(to, EXIT_A)
    } else {
      // Free text that isn't a button tap might be a question ("¿de qué sirve esto?")
      // rather than junk — answer it via FAQ before re-showing the same gate.
      await maybeAnswerFaq(lead, messageText, correlationId, OPT_IN_TEXT)
      await sendOptIn(to)
    }
    return
  }

  // D1: T&C
  if (!lead.d1Accepted) {
    if (callbackData === 'd1:accept') {
      await db.update(leads).set({ d1Accepted: true, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await sendD2(to)
    } else if (callbackData === 'd1:decline') {
      await transitionLead(lead.id, 'not_qualified', 'd1_decline', correlationId)
      await sendText(to, EXIT_A)
    } else {
      await maybeAnswerFaq(lead, messageText, correlationId, D1_TEXT)
      await sendD1(to)
    }
    return
  }

  // D2: Prizes
  if (lead.d2Accepted === null) {
    if (callbackData === 'd2:accept') {
      await db.update(leads).set({ d2Accepted: true, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await sendD3(to)
    } else if (callbackData === 'd2:decline') {
      await db.update(leads).set({ d2Accepted: false, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await transitionLead(lead.id, 'not_qualified', 'd2_decline', correlationId)
      await sendText(to, EXIT_A)
    } else {
      await maybeAnswerFaq(lead, messageText, correlationId, D2_TEXT)
      await sendD2(to)
    }
    return
  }

  // D3: Is shopper
  if (lead.d3IsShopper === null) {
    if (callbackData === 'd3:yes') {
      await db
        .update(leads)
        .set({ d3IsShopper: true, surveyQuestionIndex: 0, updatedAt: new Date() })
        .where(eq(leads.id, lead.id))
      const updated = { ...lead, d3IsShopper: true, surveyQuestionIndex: 0 }
      await proceedAfterShopperYes(updated)
    } else if (callbackData === 'd3:no') {
      await db.update(leads).set({ d3IsShopper: false, updatedAt: new Date() }).where(eq(leads.id, lead.id))
      await transitionLead(lead.id, 'quota_exhausted', 'd3_no', correlationId)
      await sendText(to, EXIT_B)
    } else {
      await maybeAnswerFaq(lead, messageText, correlationId, D3_TEXT)
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
    if (!resolvedCallback?.startsWith(`${question.fieldName}:`)) {
      await maybeAnswerFaq(lead, messageText, correlationId, question.text)
      await sendSurveyQuestion(to, idx, lead.id)
      return
    }
    const raw = resolvedCallback.split(':').slice(1).join(':')
    fieldValue = question.fieldName === 'domesticHelp' ? raw === 'true' : raw
  } else {
    // Free-text: ignore empty / stray button callbacks — just re-ask
    if (!messageText.trim()) {
      await sendText(to, 'Tuve un problema, ¿puedes repetirlo?')
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
          await sendText(to, 'Tuve un problema, ¿puedes repetirlo?')
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
      const result = await applyManualMunicipalityAllowlist(lead, {
        country: profile.country,
        stateProvince: profile.stateProvince,
        municipality: String(fieldValue),
        geoSource: fuzzyUsed ? 'text_fuzzy' : 'text_exact',
        correlationId,
      })
      if (!result.ok) return
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

  // Enter GPS gate before manual country questions
  if (nextIdx === 2) {
    const { requestGps } = await import('../gps-capture')
    await requestGps({ ...lead, surveyQuestionIndex: nextIdx })
    return
  }

  if (nextIdx <= SURVEY_QUESTION_COUNT) {
    await sendSurveyQuestion(to, nextIdx, lead.id)
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

  // Advance to Phase 2 — transitionLead syncs to TDM MySQL as a side effect (spec 010 amendment)
  await transitionLead(lead.id, 'link_sent', 'survey_complete_quota_available', correlationId)
  // Phase 2 handler will be called by the router on next tick
  const { handlePhase2 } = await import('./phase-2')
  await handlePhase2(lead, correlationId)
}

// --- Helpers ---

async function sendOptIn(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(
    to,
    OPT_IN_TEXT,
    [
      [
        { text: 'Inscribirme', callback_data: 'optin:accept' },
        { text: 'No', callback_data: 'optin:decline' },
      ],
    ],
  )
}

async function sendD1(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(
    to,
    D1_TEXT,
    [
      [
        { text: 'Confirmo y acepto', callback_data: 'd1:accept' },
        { text: 'No, gracias', callback_data: 'd1:decline' },
      ],
    ],
  )
}

async function sendD2(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(
    to,
    D2_TEXT,
    [
      [
        { text: 'Sí quiero', callback_data: 'd2:accept' },
        { text: 'No, gracias', callback_data: 'd2:decline' },
      ],
    ],
  )
}

async function sendD3(to: ChannelRecipient): Promise<void> {
  await sendInlineKeyboard(
    to,
    D3_TEXT,
    [
      [
        { text: 'Sí', callback_data: 'd3:yes' },
        { text: 'No', callback_data: 'd3:no' },
      ],
    ],
  )
}

// Re-export for callers that still import from phase-1
export { sendSurveyQuestion } from '../send-survey-question'
