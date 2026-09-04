/**
 * CAM golden-master regression suite.
 *
 * Run BEFORE features 014/015 with `npm run test:regression:update` to pin the baseline,
 * then AFTER with `npm run test:regression` — any snapshot diff is a CAM regression to
 * investigate (see specs/regression/cam-regression-analysis.md).
 *
 * Requires POSTGRES_URL pointing at a disposable test database with migrations applied.
 */
import { beforeAll, beforeEach, describe, it, vi } from 'vitest'

/* --- Mocks (hoisted above imports of the code under test) --------------------------- */

vi.mock('@/lib/telegram/send', async () => {
  const { telegramSendMockFactory } = await import('./cam-outbox')
  return telegramSendMockFactory()
})
vi.mock('@/lib/whatsapp/send', () => ({
  sendText: vi.fn(async () => {}),
  sendInlineKeyboard: vi.fn(async () => {}),
  sendVideo: vi.fn(async () => {}),
}))

// LLM field extraction → scripted values from the journey.
vi.mock('@/lib/ai/extract-survey-fields', async () => {
  const { extractFieldMockFactory } = await import('./cam-outbox')
  return extractFieldMockFactory()
})

// LLM guards → pass-through (no network).
vi.mock('@/lib/ai/sanitize', () => ({
  sanitizeInput: vi.fn(async (t: string) => t),
  InputRejectedError: class extends Error {},
}))

// QStash scheduler → keep the real module shape, no-op the calls that hit QStash.
vi.mock('@/lib/scheduler/re-engagement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/scheduler/re-engagement')>()),
  scheduleJob: vi.fn(async () => {}),
  scheduleRecontact: vi.fn(async () => {}),
  cancelPendingJobs: vi.fn(async () => {}),
  cancelPendingRecontact: vi.fn(async () => {}),
  cancelAllPendingJobsForLead: vi.fn(async () => {}),
}))

// Phase-2 outbound HTTP (TDM registration request): `REGISTRATION_CODE_MOCK_ENABLED=true`
// (set in beforeAll) makes `@/lib/tdm-registration/test-mode` short-circuit the real POST +
// OAuth. If a journey that reaches Phase 2 still makes a network call, add a `vi.mock` for
// the specific entrypoint in `@/lib/tdm-registration/client` here and pin it against the
// real function signature.
vi.mock('@/lib/tdm-registration/oauth', () => ({
  getTdmAccessToken: vi.fn(async () => 'test-token'),
}))

/* --- Suite ------------------------------------------------------------------------- */

import { resetLeadTables, expectJourneySnapshot, outbox } from './cam-harness'
import { seedQuota, CAM_JOURNEYS_MVP } from './cam-journeys'

describe('CAM regression — golden master (pre/post 014 + 015)', () => {
  beforeAll(async () => {
    process.env.REGISTRATION_CODE_MOCK_ENABLED = 'true'
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    await seedQuota()
  })

  beforeEach(async () => {
    await resetLeadTables()
    outbox.length = 0
  })

  // Swap CAM_JOURNEYS_MVP → CAM_JOURNEYS_ALL once C2–C11 are authored (014 T004a).
  for (const journey of CAM_JOURNEYS_MVP) {
    it(journey.name, async () => {
      await expectJourneySnapshot(journey)
    })
  }
})
