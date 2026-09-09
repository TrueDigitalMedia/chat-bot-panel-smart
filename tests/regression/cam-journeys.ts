/**
 * CAM regression journeys C1–C11 — see specs/regression/cam-regression-analysis.md §4.
 *
 * Each journey is a scripted list of inbound turns. The snapshot captures whatever the
 * CURRENT code does with them — these are characterization fixtures, not "correct answers".
 *
 * STATUS: C1 is a worked reference. C2–C11 are stubs to fill in during 014 T004a — each is
 * ~15 lines. Keep every `callbackData` string in sync with the real button `callback_data`
 * in src/lib/conversation/survey-questions.ts / flow-router.ts BUTTON_PREFIXES.
 */
import { db } from '@/lib/db/client'
import { quotaTargets, quotaRegionCaps } from '@/lib/db/schema'
import type { Journey } from './cam-harness'

/**
 * Deterministic quota config for the regression DB. Values are arbitrary but FIXED — they
 * only need to make C1/C7 qualify and C6 exhaust. Seed once per test file (beforeAll).
 */
export async function seedQuota(): Promise<void> {
  await db.delete(quotaTargets)
  await db.delete(quotaRegionCaps)
  await db.insert(quotaTargets).values([
    // Panamá — open NSE cell so C1 qualifies. Region name must match what
    // cam-nse-catalog.ts actually resolves for stateProvince="Panamá"/municipality="Panamá"
    // ("Centro I", not the district name) — confirmed via the C1 journey's geo_resolve log.
    { country: 'Panamá', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 1', targetCount: 100, active: true },
    // Nicaragua — a cell that we will drive to 0 available so C6 exhausts
    { country: 'Nicaragua', region: 'Managua', dimensionType: 'nse', dimensionValue: 'Nivel 4', targetCount: 0, active: true },
    // Guatemala / Costa Rica / Honduras / Rep. Dominicana — generic open NSE cells
    { country: 'Guatemala', region: 'Guatemala', dimensionType: 'nse', dimensionValue: 'Nivel 1', targetCount: 100, active: true },
    { country: 'Costa Rica', region: 'GAM', dimensionType: 'nse', dimensionValue: 'Nivel 2', targetCount: 100, active: true },
  ])
  await db.insert(quotaRegionCaps).values([
    { country: 'Panamá', region: 'Centro I', capCount: null },
    { country: 'Nicaragua', region: 'Managua', capCount: 0 },
  ])
}

/* ------------------------------------------------------------------ */
/* C1 — Full qualify, generic geo (Panamá)                             */
/* ------------------------------------------------------------------ */
/**
 * NOTE: the exact turn list below is a STARTING POINT. Run `npm run test:regression:update`
 * once on the pre-014 code; if the bot asks something these turns don't answer, the
 * snapshot will show a re-ask — add the missing turn and re-capture. That iteration IS
 * the process of writing a characterization test.
 */
export const C1_panama_qualify: Journey = {
  name: 'C1 — full qualify, generic geo (Panamá)',
  channelUserId: '999900001',
  turns: [
    { text: 'Hola' },
    { callbackData: 'optin:accept' },
    { callbackData: 'd1:accept' },
    { callbackData: 'reengagement_consent:accept' },
    { callbackData: 'd3:yes' },
    { contactPhone: '+50761234567' },
    // survey — SHARED_PREFIX
    { text: 'María Pérez', extract: { fullName: 'María Pérez' } },
    // GPS is requested right after fullName, BEFORE country is asked (gps-capture.ts
    // pins surveyQuestionIndex at 2 and intercepts every inbound until the gate
    // resolves) — opt into manual entry so country/Q3/Q4 come as normal button/free-text
    // questions instead of waiting for a location share.
    { callbackData: 'gps:manual' },
    { callbackData: 'country:Panamá' },
    { text: 'Panamá', extract: { stateProvince: 'Panamá' } },
    { text: 'Panamá', extract: { municipality: 'Panamá' } },
    // Q5 neighborhood is hidden for CAM — no turn
    { text: 'maria@example.com', extract: { email: 'maria@example.com' } },
    { callbackData: 'gender:Femenino' },
    { text: '34', extract: { age: 34 } },
    // CAM NSE block
    { callbackData: 'educationPsh:Universidad Completa' },
    { callbackData: 'cars:1' },
    { callbackData: 'domesticHelp:false' },
    { callbackData: 'householdSize:4' },
    { callbackData: 'isPregnant:false' },
    { callbackData: 'hasBabyUnder3:false' },
    { callbackData: 'bedrooms:2' },
    // SHARED_SUFFIX
    { callbackData: 'shoppingFrequency:Semanal' },
    { text: '1, 2, 3', extract: { shoppingCategories: [1, 2, 3] } },
    { callbackData: 'contactChannel:WhatsApp' },
    { callbackData: 'contactSchedule:Tarde (13-17hs)' },
  ],
}

/* ------------------------------------------------------------------ */
/* C2–C11 — stubs (fill during 014 T004a)                              */
/* ------------------------------------------------------------------ */

export const C2_guatemala_qualify: Journey = {
  name: 'C2 — full qualify, Guatemala geo catalog',
  channelUserId: '999900002',
  turns: [/* TODO: like C1 but country:Guatemala + zona/barrio answers via extract */],
}

export const C3_costarica_canton: Journey = {
  name: 'C3 — full qualify, Costa Rica "cantón" wording',
  channelUserId: '999900003',
  turns: [/* TODO: country:Costa Rica; assert Q4 text says "municipio o cantón" in snapshot */],
}

export const C4_decline_d1: Journey = {
  name: 'C4 — decline T&C at D1 (Honduras)',
  channelUserId: '999900004',
  turns: [{ text: 'Hola' }, { callbackData: 'optin:accept' }, { callbackData: 'd1:decline' }],
}

export const C5_conflict_of_interest: Journey = {
  name: 'C5 — sensitive industry / conflict of interest (El Salvador)',
  channelUserId: '999900005',
  turns: [/* TODO: reach the screening question, answer with a disqualifying industry */],
}

export const C6_quota_exhausted: Journey = {
  name: 'C6 — survey completes, no quota cell (Nicaragua)',
  channelUserId: '999900006',
  turns: [/* TODO: full survey, country:Nicaragua, low-SES answers → Nivel 4 → seeded 0 target */],
}

export const C7_pregnancy_exception: Journey = {
  name: 'C7 — pregnancy exception (Panamá)',
  channelUserId: '999900007',
  turns: [/* TODO: like C1 but isPregnant:true and drive the region cap to 0 first */],
}

export const C8_gps_in: Journey = {
  name: 'C8 — GPS share resolves inside catalog (Guatemala)',
  channelUserId: '999900008',
  turns: [/* TODO: after country step, { location: { latitude, longitude } } inside GT */],
}

export const C9_gps_out_then_manual: Journey = {
  name: 'C9 — GPS outside catalog → manual entry (Honduras)',
  channelUserId: '999900009',
  turns: [/* TODO: { location } in the ocean, then "Escribir mi ubicación", then manual geo */],
}

export const C10_mid_survey_correction: Journey = {
  name: 'C10 — mid-survey geo correction (Costa Rica)',
  channelUserId: '999900010',
  turns: [/* TODO: answer municipio, then "me equivoqué, vivo en Heredia", assert re-ask target */],
}

export const C11_manual_municipality_allowlist: Journey = {
  name: 'C11 — manual municipality allowlist hit + miss (Rep. Dominicana)',
  channelUserId: '999900011',
  turns: [/* TODO: one journey with a catalog-hit municipio, one with a miss (in_quota_geo=false) */],
}

/** MVP set — score + survey + quota + screening coverage. */
export const CAM_JOURNEYS_MVP: Journey[] = [
  C1_panama_qualify,
  C4_decline_d1,
]

/** Full set once C2–C11 are filled in. */
export const CAM_JOURNEYS_ALL: Journey[] = [
  C1_panama_qualify,
  C2_guatemala_qualify,
  C3_costarica_canton,
  C4_decline_d1,
  C5_conflict_of_interest,
  C6_quota_exhausted,
  C7_pregnancy_exception,
  C8_gps_in,
  C9_gps_out_then_manual,
  C10_mid_survey_correction,
  C11_manual_municipality_allowlist,
]
