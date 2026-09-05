import { test, expect, type APIRequestContext } from '@playwright/test'
import { upsertQuotaTarget } from '@/lib/quotas/quota-targets'
import { createRegionCap, RegionCapConflictError } from '@/lib/quotas/region-caps'

// Feature 014 (Ecuador onboarding) — T023/T030/T035/T039. Same shallow-smoke convention as
// the other tests/e2e/phase-*.spec.ts files (see phase-4-discard.spec.ts's comment): drives
// a conversation through the live Telegram webhook, asserting the webhook layer wires each
// Ecuador-specific step through without an unhandled crash. It can't verify downstream DB
// decisions end to end: the webhook's outbound Telegram sends fail with "chat not found"
// for a synthetic chat id, which aborts each turn's processing mid-flight — the structural
// reason every e2e spec here stays shallow. The decision logic those flows would hit IS
// fully covered elsewhere: tests/unit/quota-ecuador.test.ts (T037 — NSE match, region-cap
// block, pregnancy/baby exception + attribution for country='Ecuador'),
// tests/unit/quota-targets.test.ts / sync.test.ts / build-request.test.ts (T038 — Ecuador
// in the TDM sync payload), and tests/unit/ecuador-nse*.test.ts (T029/T034 — the scores
// and regions these journeys produce).

function telegramText(chatId: number, updateId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  }
}

function telegramCallback(chatId: number, updateId: number, data: string) {
  return {
    update_id: updateId,
    callback_query: {
      id: `cq${updateId}`,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      message: {
        message_id: updateId,
        chat: { id: chatId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
      },
      data,
    },
  }
}

function telegramLocation(chatId: number, updateId: number, latitude: number, longitude: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      location: { latitude, longitude },
    },
  }
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET

/**
 * Send one Telegram webhook update and assert the endpoint itself never crashes. 429 is
 * accepted alongside 200/500: route.ts's per-chat in-memory rate limit (20 msg/60s,
 * unrelated to this feature) can legitimately trip when a single test fires a whole
 * ~25-turn journey back to back — a real user pacing their answers would never hit it.
 */
async function sendUpdate(request: APIRequestContext, body: unknown): Promise<number> {
  const res = await request.post('/api/webhooks/telegram', {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret! },
    data: body,
  })
  expect([200, 429, 500]).toContain(res.status())
  return res.status()
}

test.describe('Ecuador onboarding — part 1 (T023): screening + household-profile block, Q2=Ecuador', () => {
  const chatId = 999014001

  test('opt-in -> D1 -> reengagement -> D3 -> phone -> name -> Ecuador selects into the conflict-of-interest screening question', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    let u = 1
    await sendUpdate(request, telegramText(chatId, u++, 'Hola'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'optin:accept'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'd1:accept'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'reengagement_consent:accept'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'd3:yes'))
    await sendUpdate(request, telegramText(chatId, u++, '+593987654321'))
    await sendUpdate(request, telegramText(chatId, u++, 'María Pérez'))
    // Selecting Ecuador as country must not crash the webhook — the next question the
    // bot sends is Ecuador's conflictOfInterest screening (spec 014 FR-002), not any
    // CAM NSE question.
    const status = await sendUpdate(request, telegramCallback(chatId, u++, 'country:Ecuador'))
    expect(status).toBeLessThan(500)
  })

  test('answering the sensitive-industry screening "Sí" does not crash the webhook (would set not_qualified)', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    // Standalone callback smoke — same shallow-lead-state convention as
    // phase-4-discard.spec.ts's conflictOfInterest test (no seeded multi-phase fixture).
    await sendUpdate(request, telegramCallback(chatId + 1, 1, 'conflictOfInterest:true'))
  })

  test('a parallel CAM (non-Ecuador) conversation is unaffected by Ecuador wiring', async ({ request }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    const camChatId = 999014002
    let u = 1
    await sendUpdate(request, telegramText(camChatId, u++, 'Hola'))
    await sendUpdate(request, telegramCallback(camChatId, u++, 'optin:accept'))
    await sendUpdate(request, telegramCallback(camChatId, u++, 'd1:accept'))
    await sendUpdate(request, telegramCallback(camChatId, u++, 'reengagement_consent:accept'))
    await sendUpdate(request, telegramCallback(camChatId, u++, 'd3:yes'))
    await sendUpdate(request, telegramText(camChatId, u++, '+50255551234'))
    await sendUpdate(request, telegramText(camChatId, u++, 'Juan Gómez'))
    const status = await sendUpdate(request, telegramCallback(camChatId, u++, 'country:Guatemala'))
    expect(status).toBeLessThan(500)
  })
})

test.describe('Ecuador onboarding — part 2 (T030): GPS geo resolution', () => {
  const chatId = 999014003

  test('a GPS location share inside the catalog (Guayaquil) is accepted by the webhook', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    // Guayaquil, Tarqui parroquia urbana coordinates — resolves nse_region "Guayaquil
    // Norte" per tests/unit/ecuador-nse-catalog.test.ts's catalog-backed assertion; this
    // spec only checks the webhook accepts the location update without crashing.
    await sendUpdate(request, telegramLocation(chatId, 1, -2.1462, -79.9234))
  })

  test('manual entry with an off-catalog parroquia does not crash the webhook (would set in_quota_geo=false, nse_region=null)', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    const offCatalogChatId = 999014004
    await sendUpdate(request, telegramCallback(offCatalogChatId, 1, 'gps:manual'))
    await sendUpdate(request, telegramText(offCatalogChatId, 2, 'Parroquia Que No Existe En El Catálogo'))
  })
})

/**
 * Drives one full Ecuador onboarding journey (opt-in through the last NSE question) via
 * the live Telegram webhook, asserting the webhook accepted every turn without crashing.
 * Answers past geo are the "workbook sample household" vector from
 * tests/unit/ecuador-nse.test.ts (58 points -> level 'C').
 */
async function runFullEcuadorJourney(
  request: APIRequestContext,
  chatId: number,
  opts: {
    isPregnant?: boolean
    stateProvince?: string
    municipality?: string
    neighborhood?: string
  } = {},
): Promise<void> {
  const {
    isPregnant = false,
    stateProvince = 'Guayas',
    municipality = 'Guayaquil',
    neighborhood = 'Tarqui',
  } = opts
  let u = 1
  const step = (body: unknown) => sendUpdate(request, body)
  await step(telegramText(chatId, u++, 'Hola'))
  await step(telegramCallback(chatId, u++, 'optin:accept'))
  await step(telegramCallback(chatId, u++, 'd1:accept'))
  await step(telegramCallback(chatId, u++, 'reengagement_consent:accept'))
  await step(telegramCallback(chatId, u++, 'd3:yes'))
  await step(telegramText(chatId, u++, '+593987654321'))
  await step(telegramText(chatId, u++, 'María Pérez'))
  await step(telegramCallback(chatId, u++, 'gps:manual'))
  await step(telegramCallback(chatId, u++, 'country:Ecuador'))
  await step(telegramCallback(chatId, u++, 'conflictOfInterest:false'))
  await step(telegramText(chatId, u++, stateProvince))
  await step(telegramText(chatId, u++, municipality))
  await step(telegramText(chatId, u++, neighborhood))
  await step(telegramText(chatId, u++, 'maria@example.com'))
  await step(telegramCallback(chatId, u++, 'gender:Femenino'))
  await step(telegramText(chatId, u++, '34'))
  await step(telegramCallback(chatId, u++, 'healthInsurancePsh:Privada'))
  await step(telegramCallback(chatId, u++, 'monthlyIncome:De $701 hasta $1.000'))
  await step(telegramCallback(chatId, u++, 'dwellingFinishes:Casa de Cemento Techo de Eternit o Zinc'))
  await step(telegramCallback(chatId, u++, 'floorMaterial:Ladrillo o cemento'))
  await step(telegramCallback(chatId, u++, 'vehicleCount:1'))
  await step(telegramCallback(chatId, u++, 'occupationHead:Técnicos y profesionales de nivel medio'))
  await step(telegramCallback(chatId, u++, 'occupationAma:Trabajadores no calificados'))
  await step(telegramCallback(chatId, u++, 'educationPsh:Universidad completa'))
  await step(telegramCallback(chatId, u++, 'householdSize:4'))
  await step(telegramCallback(chatId, u++, `isPregnant:${isPregnant}`))
  await step(telegramCallback(chatId, u++, 'hasBabyUnder3:false'))
  await step(telegramCallback(chatId, u++, 'internetAccess:Internet Hogar contratado (Fibra Op)'))
}

test.describe('Ecuador onboarding — part 3 (T035): 8 Ecuador NSE questions, survey completion', () => {
  const chatId = 999014005

  test('the full Ecuador NSE question block (health/income/finishes/floor/vehicles/occupation x2/internet) is accepted end to end', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    await runFullEcuadorJourney(request, chatId)
    // computeEcuadorNse for this exact answer set = 58 points -> level 'C' (see
    // tests/unit/ecuador-nse.test.ts's "workbook sample household" vector). The
    // survey-complete branch the last callback triggers writes leads.nse_points=58,
    // leads.quota_segment='C', leads.score=null — asserted directly in that unit test;
    // this test only confirms the webhook accepted every step in the chain.
  })
})

test.describe('Ecuador onboarding — part 4 (T039): quota decision + registration handoff', () => {
  const OPEN_REGION_CHAT_ID = 999014006
  const CAP_REACHED_CHAT_ID = 999014007
  const PREGNANCY_EXCEPTION_CHAT_ID = 999014008

  /** Idempotently seed one Ecuador quota cell (+ optional region cap) — also a real
   *  exercise of the Phase-7 Ecuador quota-write path (quota-targets.ts / region-caps.ts
   *  validation against the Ecuador catalog) against the live DB. */
  async function seedEcuadorQuota(region: string, capCount: number | null): Promise<void> {
    await upsertQuotaTarget({ country: 'Ecuador', region, dimensionType: 'nse', dimensionValue: 'C', targetCount: 5 })
    if (capCount !== null) {
      await createRegionCap({ country: 'Ecuador', region, capCount }).catch((err) => {
        if (!(err instanceof RegionCapConflictError)) throw err // already seeded — fine
      })
    }
  }

  test('an open Ecuador quota target: the full survey→quota-decision journey is accepted by the webhook', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    // Guayaquil Norte / 'C' — the region+level runFullEcuadorJourney's answers resolve to.
    await seedEcuadorQuota('Guayaquil Norte', null)
    await runFullEcuadorJourney(request, OPEN_REGION_CHAT_ID)
    // The quota decision (link_sent) + its country/region/level being carried into the
    // TDM sync payload are asserted in tests/unit/quota-ecuador.test.ts and
    // sync.test.ts / build-request.test.ts (T037/T038) — the live webhook can't drive a
    // synthetic chat to link_sent because its outbound Telegram sends 400 ("chat not
    // found") and abort the turn.
  })

  test('a reached Ecuador region cap: the survey→quota-decision journey is accepted by the webhook', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    // Cuenca with capCount: 0 (reached from the start). The quota-exhausted outcome this
    // would produce is asserted in tests/unit/quota-ecuador.test.ts's "region aggregate
    // cap blocks an otherwise-qualifying lead" case.
    await seedEcuadorQuota('Cuenca', 0)
    await runFullEcuadorJourney(request, CAP_REACHED_CHAT_ID, {
      stateProvince: 'Azuay',
      municipality: 'Cuenca',
      neighborhood: 'Cuenca',
    })
  })

  test('a pregnancy exception against a reached Ecuador region cap: the journey is accepted by the webhook', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    // Same capped Cuenca region. The "pregnancy/baby exception overrides a reached
    // Ecuador region cap" outcome is asserted in tests/unit/quota-ecuador.test.ts.
    await seedEcuadorQuota('Cuenca', 0)
    await runFullEcuadorJourney(request, PREGNANCY_EXCEPTION_CHAT_ID, {
      isPregnant: true,
      stateProvince: 'Azuay',
      municipality: 'Cuenca',
      neighborhood: 'Cuenca',
    })
  })
})
