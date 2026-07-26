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
  lookupNseRegion,
  type GeoSource,
} from '@/lib/geo/cam-nse-catalog'
import { sendSurveyQuestion } from '@/lib/conversation/send-survey-question'
import type { Lead } from '@/types/lead'

export type GpsGateStatus =
  | 'pending_request'
  | 'awaiting_location'
  | 'awaiting_confirm'
  | 'done'
  | 'skipped_manual'
  | null

const SKIP_TEXT = /^escribir mi ubicaci[oó]n$/i
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
    if (SKIP_TEXT.test(text)) {
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
  const nseRegion = lookupNseRegion(country, proposal.stateProvince, proposal.municipality)

  if (!nseRegion) {
    console.info('[gps] nse_allowlist_miss', {
      leadId: lead.id,
      country,
      stateProvince: proposal.stateProvince,
      municipality: proposal.municipality,
    })
  } else {
    console.info('[gps] nse_allowlist_hit', {
      leadId: lead.id,
      country,
      nseRegion,
    })
  }

  const neighborhood = proposal.neighborhood?.trim() || null
  await db
    .update(surveyProfiles)
    .set({
      country,
      stateProvince: proposal.stateProvince,
      municipality: proposal.municipality,
      neighborhood,
      nseRegion,
      geoSource: 'gps_share' satisfies GeoSource,
      inQuotaGeo: nseRegion !== null,
    })
    .where(eq(surveyProfiles.leadId, lead.id))

  await setGpsState(lead.id, { gpsGateStatus: 'done', gpsProposal: null })

  if (!neighborhood) {
    // Ask only neighborhood (Q5), then continue
    await db
      .update(leads)
      .set({ surveyQuestionIndex: 5, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
    await db
      .update(flowStates)
      .set({ surveyQuestionIndex: 5, updatedAt: new Date() })
      .where(eq(flowStates.leadId, lead.id))
    await sendSurveyQuestion(lead, 5, lead.id)
    return
  }

  // Skip to email (Q6)
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
  const nseRegion = lookupNseRegion(opts.country, opts.stateProvince, opts.municipality)
  console.info(nseRegion ? '[gps] nse_allowlist_hit' : '[gps] nse_allowlist_miss', {
    leadId: lead.id,
    path: 'manual',
    country: opts.country,
    stateProvince: opts.stateProvince,
    municipality: opts.municipality,
    nseRegion,
  })
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
