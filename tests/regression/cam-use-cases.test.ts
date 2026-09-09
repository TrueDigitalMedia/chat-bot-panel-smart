/**
 * CAM recruitment flow — use-case regression (full conversations, explicit assertions).
 *
 * See specs/regression/use-cases.md. Each `it()` drives a whole conversation through
 * `cam-harness.runJourney` and asserts the terminal lead status / profile — complementary
 * to cam-golden-master.test.ts, which is the byte-for-byte "nothing moved" snapshot.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/* --- Mocks (hoisted above imports of the code under test) — same as the golden master --- */
vi.mock('@/lib/telegram/send', async () => {
  const { telegramSendMockFactory } = await import('./cam-outbox')
  return telegramSendMockFactory()
})
vi.mock('@/lib/whatsapp/send', () => ({
  sendText: vi.fn(async () => {}),
  sendInlineKeyboard: vi.fn(async () => {}),
  sendVideo: vi.fn(async () => {}),
}))
vi.mock('@/lib/ai/extract-survey-fields', async () => {
  const { extractFieldMockFactory } = await import('./cam-outbox')
  return extractFieldMockFactory()
})
vi.mock('@/lib/ai/sanitize', () => ({
  sanitizeInput: vi.fn(async (t: string) => t),
  InputRejectedError: class extends Error {},
}))
vi.mock('@/lib/scheduler/re-engagement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scheduler/re-engagement')>()),
  scheduleJob: vi.fn(async () => {}),
  scheduleRecontact: vi.fn(async () => {}),
  cancelPendingJobs: vi.fn(async () => {}),
  cancelPendingRecontact: vi.fn(async () => {}),
  cancelAllPendingJobsForLead: vi.fn(async () => {}),
}))
vi.mock('@/lib/tdm-registration/oauth', () => ({ getTdmAccessToken: vi.fn(async () => 'test-token') }))

import { db } from '@/lib/db/client'
import { quotaTargets, quotaRegionCaps } from '@/lib/db/schema'
import { resetLeadTables, runJourney, outbox } from './cam-harness'
import type { Turn } from './cam-harness'

/* --- per-file quota config (own beforeAll; the golden-master file re-seeds its own) --- */
async function seed() {
  await db.delete(quotaTargets)
  await db.delete(quotaRegionCaps)
  await db.insert(quotaTargets).values([
    // Panamá / Centro I — open Nivel 1 so the high-SES happy path qualifies
    { country: 'Panamá', region: 'Centro I', dimensionType: 'nse', dimensionValue: 'Nivel 1', targetCount: 100, active: true },
    // Nicaragua / Sur I — Nivel 4 full (0), Nivel 1 open (for the pregnancy-exception attribution)
    { country: 'Nicaragua', region: 'Sur I', dimensionType: 'nse', dimensionValue: 'Nivel 4', targetCount: 0, active: true },
    { country: 'Nicaragua', region: 'Sur I', dimensionType: 'nse', dimensionValue: 'Nivel 1', targetCount: 100, active: true },
    // Costa Rica / Area metropolitana I — open
    { country: 'Costa Rica', region: 'Area metropolitana I', dimensionType: 'nse', dimensionValue: 'Nivel 1', targetCount: 100, active: true },
  ])
}

/** SHARED_PREFIX + high-SES NSE + SHARED_SUFFIX — a full CAM journey that qualifies at Nivel 1. */
function fullJourney(country: string, geo: { sp: string; muni: string }, over: {
  reengage?: 'accept' | 'decline'
  age?: number
  nse?: 'high' | 'low'
  isPregnant?: boolean
} = {}): Turn[] {
  const nseLow = over.nse === 'low'
  return [
    { text: 'Hola' },
    { callbackData: 'optin:accept' },
    { callbackData: 'd1:accept' },
    { callbackData: `reengagement_consent:${over.reengage ?? 'accept'}` },
    { callbackData: 'd3:yes' },
    { contactPhone: '+50761234567' },
    { text: 'María Pérez', extract: { fullName: 'María Pérez' } },
    { callbackData: 'gps:manual' },
    { callbackData: `country:${country}` },
    { text: geo.sp, extract: { stateProvince: geo.sp } },
    { text: geo.muni, extract: { municipality: geo.muni } },
    { text: 'maria@example.com', extract: { email: 'maria@example.com' } },
    { callbackData: 'gender:Femenino' },
    { text: String(over.age ?? 34), extract: { age: over.age ?? 34 } },
    { callbackData: nseLow ? 'educationPsh:Primaria Completa' : 'educationPsh:Universidad Completa' },
    { callbackData: nseLow ? 'cars:0' : 'cars:1' },
    { callbackData: 'domesticHelp:false' },
    { callbackData: nseLow ? 'householdSize:6' : 'householdSize:4' },
    { callbackData: `isPregnant:${over.isPregnant ? 'true' : 'false'}` },
    { callbackData: 'hasBabyUnder3:false' },
    { callbackData: nseLow ? 'bedrooms:1' : 'bedrooms:2' },
    { callbackData: 'shoppingFrequency:Semanal' },
    { text: '1, 2, 3', extract: { shoppingCategories: [1, 2, 3] } },
    { callbackData: 'contactChannel:WhatsApp' },
    { callbackData: 'contactSchedule:Tarde (13-17hs)' },
  ]
}

let uid = 990000
const nextId = () => String(uid++)

describe('CAM flow — use cases (full conversations)', () => {
  beforeAll(seed)
  beforeEach(async () => {
    await resetLeadTables()
    outbox.length = 0
  })

  it('UC-A — happy path: full survey, quota available → link_sent', async () => {
    const s = await runJourney({ name: 'uc-a', channelUserId: nextId(), turns: fullJourney('Panamá', { sp: 'Panamá', muni: 'Panamá' }) })
    expect(s.lead.leadStatus).toBe('link_sent')
    expect(s.lead.statusReason).toBe('survey_complete_quota_available')
    expect(s.surveyProfile?.fullName).toBe('María Pérez')
    expect(s.surveyProfile?.country).toBe('Panamá')
    expect(s.lead.quotaSegment).toBe('Nivel 1')
  })

  it('UC-B — declines the opt-in → not_qualified / opt_in_decline', async () => {
    const s = await runJourney({ name: 'uc-b', channelUserId: nextId(), turns: [{ text: 'Hola' }, { callbackData: 'optin:decline' }] })
    expect(s.lead.leadStatus).toBe('not_qualified')
    expect(s.lead.statusReason).toBe('opt_in_decline')
  })

  it('UC-C — declines the T&C (D1) → not_qualified / d1_decline', async () => {
    const s = await runJourney({ name: 'uc-c', channelUserId: nextId(), turns: [{ text: 'Hola' }, { callbackData: 'optin:accept' }, { callbackData: 'd1:decline' }] })
    expect(s.lead.leadStatus).toBe('not_qualified')
    expect(s.lead.statusReason).toBe('d1_decline')
  })

  it('UC-D — not the household shopper (D3=no) → quota_exhausted / d3_no', async () => {
    const s = await runJourney({
      name: 'uc-d', channelUserId: nextId(),
      turns: [{ text: 'Hola' }, { callbackData: 'optin:accept' }, { callbackData: 'd1:accept' }, { callbackData: 'reengagement_consent:accept' }, { callbackData: 'd3:no' }],
    })
    expect(s.lead.leadStatus).toBe('quota_exhausted')
    expect(s.lead.statusReason).toBe('d3_no')
  })

  it('UC-E — declines re-engagement consent (optional) → survey still completes → link_sent', async () => {
    const s = await runJourney({ name: 'uc-e', channelUserId: nextId(), turns: fullJourney('Panamá', { sp: 'Panamá', muni: 'Panamá' }, { reengage: 'decline' }) })
    expect(s.lead.leadStatus).toBe('link_sent')
    expect(s.lead.reEngagementConsentAccepted).toBe(false)
  })

  it('UC-F — minor (age 16) → not_qualified / age_minor right after the age answer', async () => {
    const s = await runJourney({ name: 'uc-f', channelUserId: nextId(), turns: fullJourney('Panamá', { sp: 'Panamá', muni: 'Panamá' }, { age: 16 }) })
    expect(s.lead.leadStatus).toBe('not_qualified')
    expect(s.lead.statusReason).toBe('age_minor')
  })

  it('UC-G — survey completes, segment quota cell is full → quota_exhausted / survey_complete_no_quota', async () => {
    const s = await runJourney({ name: 'uc-g', channelUserId: nextId(), turns: fullJourney('Nicaragua', { sp: 'Managua', muni: 'Managua' }, { nse: 'low' }) })
    expect(s.lead.quotaSegment).toBe('Nivel 4')
    expect(s.lead.leadStatus).toBe('quota_exhausted')
    expect(s.lead.statusReason).toBe('survey_complete_no_quota')
  })

  it('UC-H — pregnancy exception: qualifies even though the Nivel 4 cell is at 0', async () => {
    const s = await runJourney({ name: 'uc-h', channelUserId: nextId(), turns: fullJourney('Nicaragua', { sp: 'Managua', muni: 'Managua' }, { nse: 'low', isPregnant: true }) })
    expect(s.surveyProfile?.isPregnant).toBe(true)
    expect(s.lead.leadStatus).toBe('link_sent')
  })

  it('UC-CAM2 — Costa Rica uses the "cantón" geo wording; qualifies', async () => {
    const s = await runJourney({ name: 'uc-cam2', channelUserId: nextId(), turns: fullJourney('Costa Rica', { sp: 'San Jose', muni: 'Goicoechea' }) })
    const transcript = s.transcript.map((e) => e.text ?? '').join('\n')
    expect(transcript).toMatch(/cant[oó]n/i)
    expect(s.lead.leadStatus).toBe('link_sent')
    expect(s.surveyProfile?.country).toBe('Costa Rica')
  })
})
