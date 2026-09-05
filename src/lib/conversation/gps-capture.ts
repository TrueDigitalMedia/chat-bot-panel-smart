import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates, leads, surveyProfiles } from '@/lib/db/schema'
import {
  sendLocationRequest,
  confirmLocationKeyboardRemoved,
  sendText,
} from '@/lib/messaging/send'
import { reverseGeocode, type PlaceProposal } from '@/lib/geo/reverse-geocode'
import { askGpsConfirmation, GPS_YES, GPS_NO } from '@/lib/geo/gps-confirm'
import {
  canonicalCountry,
  type GeoSource,
} from '@/lib/geo/cam-nse-catalog'
import { getCountryConfig } from '@/lib/countries/registry'
import { sendSurveyQuestion } from '@/lib/conversation/send-survey-question'
import { matchButtonChoice } from './match-button-choice'
import { interpretButtonAnswer } from './interpret-button-answer'
import type { Lead } from '@/types/lead'
import type { InlineKeyboardButton } from '@/types/telegram'

export type GpsGateStatus =
  | 'pending_request'
  | 'awaiting_location'
  | 'awaiting_confirm'
  | 'done'
  | 'skipped_manual'
  | null

// Shared literal with messaging/send.ts's own copy (see that file's comment on why it
// isn't imported from here instead).
const GPS_MANUAL_CALLBACK = 'gps:manual'
// Any mention of "escribir"/"manual"/"a mano" anywhere in the text — not anchored to
// the full button label — so "escribir", "escribir ubicacion", "escribir mi
// ubicación", "quiero hacerlo manual", "a mano" etc. all resolve. Safe to be this
// permissive: this gate only has two ways out (share GPS or type it), so any mention
// of "escribir"/"manual" here is never ambiguous with anything else.
const SKIP_TEXT = /\b(?:escribir|manual)\b|\ba mano\b/i
const SKIP_BUTTON: InlineKeyboardButton[][] = [
  [{ text: 'Escribir ubicación', callback_data: GPS_MANUAL_CALLBACK }],
]
// Only used to give interpretButtonAnswer two options to classify against — it
// self-discards (returns null unconditionally) for a single-option set. GPS sharing
// itself has no real button (it's a native location share), so this entry is never
// actually sent to the user; it exists purely for the AI prompt's option list.
const GPS_SHARE_PSEUDO_CALLBACK = 'gps:share'
const MANUAL_ENTRY_CLASSIFY_BUTTONS: InlineKeyboardButton[][] = [
  [{ text: 'Compartir mi ubicación GPS', callback_data: GPS_SHARE_PSEUDO_CALLBACK }],
  [{ text: 'Escribir mi ubicación a mano', callback_data: GPS_MANUAL_CALLBACK }],
]

/**
 * Resolves free text typed at the GPS gate to "wants manual entry" — regex first
 * (cheap, no AI cost), then matchButtonChoice (numeric "1", exact/typo-tolerant label),
 * then interpretButtonAnswer (AI) as the final fallback for anything phrased
 * differently ("prefiero hacerlo yo mismo", "no tengo gps", etc.) — same 3-tier
 * resolution every other button-adjacent free-text gate in this codebase uses
 * (resolveGateDecision in phase-1.ts).
 */
async function wantsManualEntry(
  text: string,
  opts: { leadId: string; correlationId: string },
): Promise<boolean> {
  if (!text.trim()) return false
  if (SKIP_TEXT.test(text)) return true
  if (matchButtonChoice(SKIP_BUTTON, text) === GPS_MANUAL_CALLBACK) return true
  const interpreted = await interpretButtonAnswer(
    MANUAL_ENTRY_CLASSIFY_BUTTONS,
    text,
    'Comparte tu ubicación GPS o escribe tu ubicación a mano.',
    opts,
  )
  return interpreted === GPS_MANUAL_CALLBACK
}
/** Button label with or without leading emoji — if Telegram sends text instead of location. */
const SHARE_LOCATION_TEXT = /^(?:📍\s*)?compartir ubicaci[oó]n$/i

async function getGpsState(leadId: string): Promise<{
  gpsGateStatus: string | null
  gpsProposal: PlaceProposal | null
}> {
  const [row] = await db
    .select({
      gpsGateStatus: flowStates.gpsGateStatus,
      gpsProposal: flowStates.gpsProposal,
    })
    .from(flowStates)
    .where(eq(flowStates.leadId, leadId))
    .limit(1)
  return {
    gpsGateStatus: row?.gpsGateStatus ?? null,
    gpsProposal: (row?.gpsProposal as PlaceProposal | null) ?? null,
  }
}

async function setGpsState(
  leadId: string,
  patch: {
    gpsGateStatus?: string | null
    gpsProposal?: PlaceProposal | null
  },
): Promise<void> {
  await db
    .update(flowStates)
    .set({
      ...(patch.gpsGateStatus !== undefined ? { gpsGateStatus: patch.gpsGateStatus } : {}),
      ...(patch.gpsProposal !== undefined ? { gpsProposal: patch.gpsProposal } : {}),
      updatedAt: new Date(),
    })
    .where(eq(flowStates.leadId, leadId))
}

/** True when geo step needs GPS gate before manual country (Q2). */
export async function needsGpsCapture(lead: Lead): Promise<boolean> {
  if (lead.d3IsShopper !== true) return false
  if (lead.surveyQuestionIndex < 2) return false
  const { gpsGateStatus } = await getGpsState(lead.id)
  if (gpsGateStatus === 'done' || gpsGateStatus === 'skipped_manual') return false
  return true
}

export async function requestGps(lead: Lead): Promise<void> {
  console.info('[gps] gps_requested', { leadId: lead.id })
  await setGpsState(lead.id, {
    gpsGateStatus: 'awaiting_location',
    gpsProposal: null,
  })
  // Keep survey index at country (2) while gate runs
  if (lead.surveyQuestionIndex < 2) {
    await db
      .update(leads)
      .set({ surveyQuestionIndex: 2, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db
      .update(flowStates)
      .set({ surveyQuestionIndex: 2, updatedAt: new Date() })
      .where(eq(flowStates.leadId, lead.id))
  }
  await sendLocationRequest(lead)
}

async function beginManualGeo(lead: Lead): Promise<void> {
  console.info('[gps] skipped_manual', { leadId: lead.id })
  await setGpsState(lead.id, { gpsGateStatus: 'skipped_manual', gpsProposal: null })
  await db
    .update(leads)
    .set({ surveyQuestionIndex: 2, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({ surveyQuestionIndex: 2, updatedAt: new Date() })
    .where(eq(flowStates.leadId, lead.id))
  await sendSurveyQuestion(lead, 2, lead.id)
}

/**
 * Intercept GPS gate. Returns true if the inbound event was consumed.
 */
export async function handleGpsCapture(
  lead: Lead,
  opts: {
    text?: string
    location?: { latitude: number; longitude: number }
    callbackData?: string
    correlationId: string
  },
): Promise<boolean> {
  if (!(await needsGpsCapture(lead))) return false

  const { gpsGateStatus, gpsProposal } = await getGpsState(lead.id)

  // First entry: send request
  if (!gpsGateStatus || gpsGateStatus === 'pending_request') {
    await requestGps(lead)
    return true
  }

  if (opts.callbackData === GPS_YES || opts.callbackData === GPS_NO) {
    if (gpsGateStatus !== 'awaiting_confirm' || !gpsProposal) {
      await requestGps(lead)
      return true
    }
    if (opts.callbackData === GPS_NO) {
      console.info('[gps] gps_confirm_no', { leadId: lead.id })
      await beginManualGeo(lead)
      return true
    }
    console.info('[gps] gps_confirm_yes', { leadId: lead.id })
    await applyAllowlistAfterConfirm(lead, gpsProposal, opts.correlationId)
    return true
  }

  if (gpsGateStatus === 'awaiting_location') {
    if (opts.callbackData === GPS_MANUAL_CALLBACK) {
      await confirmLocationKeyboardRemoved(
        lead,
        'De acuerdo, continuamos con las preguntas de ubicación.',
      )
      await beginManualGeo(lead)
      return true
    }

    if (opts.location) {
      console.info('[gps] gps_received', { leadId: lead.id })
      const proposal = await reverseGeocode(opts.location.latitude, opts.location.longitude)
      if (!proposal) {
        console.warn('[gps] reverse_geocode_fail', { leadId: lead.id })
        await confirmLocationKeyboardRemoved(
          lead,
          'No pude identificar tu ubicación. Vamos a preguntarte el país y la zona a mano.',
        )
        await beginManualGeo(lead)
        return true
      }
      console.info('[gps] reverse_geocode_ok', {
        leadId: lead.id,
        country: proposal.country,
        stateProvince: proposal.stateProvince,
        municipality: proposal.municipality,
        hasNeighborhood: !!proposal.neighborhood,
      })
      await setGpsState(lead.id, {
        gpsGateStatus: 'awaiting_confirm',
        gpsProposal: proposal,
      })
      await confirmLocationKeyboardRemoved(lead, '✅ Ubicación recibida.')
      await askGpsConfirmation(lead, proposal)
      return true
    }

    const text = opts.text?.trim() ?? ''
    if (await wantsManualEntry(text, { leadId: lead.id, correlationId: opts.correlationId })) {
      await confirmLocationKeyboardRemoved(
        lead,
        'De acuerdo, continuamos con las preguntas de ubicación.',
      )
      await beginManualGeo(lead)
      return true
    }

    // User tapped/typed the GPS button label but Telegram did not attach coordinates
    // (common on Desktop/Web). Re-show the native location keyboard; do NOT skip to manual.
    if (SHARE_LOCATION_TEXT.test(text) || text.length > 0) {
      if (!SHARE_LOCATION_TEXT.test(text) && text.length > 0) {
        // Could be a request to correct an earlier answer rather than location text —
        // this gate has no other FAQ/fallback awareness, so without this check any
        // correction request typed here just repeats the location prompt forever.
        const { tryHandleCorrectionRequest } = await import('./correction')
        if (
          await tryHandleCorrectionRequest(
            lead,
            text,
            opts.correlationId,
            'Comparte tu ubicación o escribe tu departamento y municipio.',
          )
        ) {
          return true
        }
      }
      await sendText(
        lead,
        SHARE_LOCATION_TEXT.test(text)
          ? 'Para compartir GPS usa el botón del teclado de Telegram (📍). Funciona mejor en la app móvil.\n\nSi no aparece, toca «Escribir mi ubicación».'
          : 'Aún necesitamos tu ubicación. Usa el botón 📍 del teclado, o «Escribir mi ubicación» para continuar a mano.',
      )
      await sendLocationRequest(lead)
      return true
    }

    await sendLocationRequest(lead)
    return true
  }

  if (gpsGateStatus === 'awaiting_confirm') {
    const text = opts.text?.trim() ?? ''
    if (text) {
      const { tryHandleCorrectionRequest } = await import('./correction')
      if (
        await tryHandleCorrectionRequest(
          lead,
          text,
          opts.correlationId,
          '¿Confirmas que esta es tu ubicación?',
        )
      ) {
        return true
      }
    }
    // Re-prompt confirm if user sends unrelated text
    if (gpsProposal) {
      await askGpsConfirmation(lead, gpsProposal)
    } else {
      await requestGps(lead)
    }
    return true
  }

  return false
}

/**
 * A municipality outside the NSE allowlist no longer dead-ends the conversation here —
 * it only means quota can't be attributed to a specific NSE/edad/integrantes cell.
 * checkQuotaAvailability's pregnancy/baby-under-3 exception (scoring/quota.ts) always
 * qualifies regardless of region, but that check only runs at the end of the survey;
 * isPregnant/hasBabyUnder3 aren't asked until Q13/Q14, well after municipality (Q4), so
 * rejecting immediately here shut out exception-qualified leads before the bot ever
 * knew they applied. Saving inQuotaGeo: false and continuing lets the real quota check
 * decide once every answer — including the exception — is in.
 */
async function applyAllowlistAfterConfirm(
  lead: Lead,
  proposal: PlaceProposal,
  _correlationId: string,
): Promise<void> {
  const country = canonicalCountry(proposal.country) ?? proposal.country
  const nseRegion = getCountryConfig(country).resolveNseRegion({
    stateProvince: proposal.stateProvince,
    municipality: proposal.municipality,
    neighborhood: null,
  })

  console.info(
    JSON.stringify({
      event: 'geo_resolve',
      lead_id: lead.id,
      path: 'gps',
      country,
      state_province: proposal.stateProvince,
      municipality: proposal.municipality,
      // GPS path never captures a parroquia (proposal is department/municipality only),
      // so Guayaquil/Quito GPS hits resolve via the cantón-only fallback — logged as null.
      neighborhood: null,
      codigo_postal: null,
      matched_region: nseRegion,
    }),
  )

  // Q5 (neighborhood) is never asked — recorded as null unconditionally, GPS-detected
  // value included, so it's silently hidden from every user regardless of channel.
  await db
    .update(surveyProfiles)
    .set({
      country,
      stateProvince: proposal.stateProvince,
      municipality: proposal.municipality,
      neighborhood: null,
      nseRegion,
      geoSource: 'gps_share' satisfies GeoSource,
      inQuotaGeo: nseRegion !== null,
    })
    .where(eq(surveyProfiles.leadId, lead.id))

  await setGpsState(lead.id, { gpsGateStatus: 'done', gpsProposal: null })

  // Skip straight to email (Q6)
  await db
    .update(leads)
    .set({ surveyQuestionIndex: 6, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
  await db
    .update(flowStates)
    .set({ surveyQuestionIndex: 6, updatedAt: new Date() })
    .where(eq(flowStates.leadId, lead.id))
  await sendSurveyQuestion(lead, 6, lead.id)
}

/**
 * After saving municipality on the manual path — allowlist lookup. A miss no longer
 * ends the conversation (see applyAllowlistAfterConfirm above for why); it just means
 * this lead won't attribute to a specific quota cell unless the pregnancy/baby
 * exception applies, decided later by checkQuotaAvailability at survey end.
 */
export async function applyManualMunicipalityAllowlist(
  lead: Lead,
  opts: {
    country: string
    stateProvince: string
    municipality: string
    geoSource: GeoSource
    correlationId: string
  },
): Promise<{ nseRegion: string | null }> {
  const [manualProfile] = await db
    .select({ neighborhood: surveyProfiles.neighborhood, scoringAnswersJson: surveyProfiles.scoringAnswersJson })
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, lead.id))
    .limit(1)
  const codigoPostal = (manualProfile?.scoringAnswersJson as Record<string, unknown> | null)?.codigoPostal ?? null
  const nseRegion = getCountryConfig(opts.country).resolveNseRegion({
    stateProvince: opts.stateProvince,
    municipality: opts.municipality,
    neighborhood: manualProfile?.neighborhood ?? null,
  })
  console.info(
    JSON.stringify({
      event: 'geo_resolve',
      lead_id: lead.id,
      path: 'manual',
      country: opts.country,
      state_province: opts.stateProvince,
      municipality: opts.municipality,
      // Ecuador's Q5 (parroquia) is a real answer that can change the resolved region
      // (Guayaquil/Quito split); null for CAM, where Q5 is hidden.
      neighborhood: manualProfile?.neighborhood ?? null,
      // México captures a Código Postal (geo fallback — spec 015 T021); null elsewhere.
      codigo_postal: codigoPostal,
      matched_region: nseRegion,
    }),
  )
  await db
    .update(surveyProfiles)
    .set({
      nseRegion,
      geoSource: opts.geoSource,
      inQuotaGeo: nseRegion !== null,
    })
    .where(eq(surveyProfiles.leadId, lead.id))
  return { nseRegion }
}
