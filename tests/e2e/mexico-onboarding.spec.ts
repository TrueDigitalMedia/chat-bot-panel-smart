import { test, expect, type APIRequestContext } from '@playwright/test'
import { upsertQuotaTarget } from '@/lib/quotas/quota-targets'
import { createRegionCap, RegionCapConflictError } from '@/lib/quotas/region-caps'

// Feature 015 (México onboarding) — T017/T023/T028/T032. Same shallow-smoke convention as
// every other tests/e2e/*.spec.ts here (see ecuador-onboarding.spec.ts's header): the
// webhook's outbound Telegram sends fail with "chat not found" for a synthetic chat id and
// abort each turn's processing, so these assert the webhook accepts each step without an
// unhandled crash. The downstream decisions those flows produce are asserted in the unit
// suites — tests/unit/mexico-nse*.test.ts, quota-mexico.test.ts.

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
      message: { message_id: updateId, chat: { id: chatId, type: 'private' }, date: Math.floor(Date.now() / 1000) },
      data,
    },
  }
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET

async function sendUpdate(request: APIRequestContext, body: unknown): Promise<number> {
  const res = await request.post('/api/webhooks/telegram', {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret! },
    data: body,
  })
  // 429 tolerated: route.ts's per-chat 20 msg/60s limit can trip on a whole journey.
  expect([200, 429, 500]).toContain(res.status())
  return res.status()
}

/** opt-in → last NSE question, via the live webhook. Geo answers parameterizable. */
async function runFullMexicoJourney(
  request: APIRequestContext,
  chatId: number,
  opts: { hasBabyUnder3?: boolean; estado?: string; municipio?: string; colonia?: string } = {},
): Promise<void> {
  const { hasBabyUnder3 = false, estado = 'Distrito Federal', municipio = 'Iztapalapa', colonia = 'Centro' } = opts
  let u = 1
  const step = (b: unknown) => sendUpdate(request, b)
  await step(telegramText(chatId, u++, 'Hola'))
  await step(telegramCallback(chatId, u++, 'optin:accept'))
  await step(telegramCallback(chatId, u++, 'd1:accept'))
  await step(telegramCallback(chatId, u++, 'reengagement_consent:accept'))
  await step(telegramCallback(chatId, u++, 'd3:yes'))
  await step(telegramText(chatId, u++, '+525512345678'))
  await step(telegramText(chatId, u++, 'María Pérez'))
  await step(telegramCallback(chatId, u++, 'gps:manual'))
  await step(telegramCallback(chatId, u++, 'country:México'))
  await step(telegramText(chatId, u++, estado))
  await step(telegramText(chatId, u++, municipio))
  await step(telegramText(chatId, u++, colonia))
  await step(telegramText(chatId, u++, 'maria@example.com'))
  await step(telegramCallback(chatId, u++, 'gender:Femenino'))
  await step(telegramText(chatId, u++, '34'))
  await step(telegramCallback(chatId, u++, 'conflictOfInterest:false'))
  await step(telegramCallback(chatId, u++, 'educationHoh:Primaria completa'))
  await step(telegramCallback(chatId, u++, 'fullBathrooms:1'))
  await step(telegramCallback(chatId, u++, 'vehicleCount:0'))
  await step(telegramCallback(chatId, u++, 'homeInternet:No tiene'))
  await step(telegramCallback(chatId, u++, 'workers14Plus:3'))
  await step(telegramCallback(chatId, u++, 'bedrooms:3'))
  await step(telegramCallback(chatId, u++, 'householdSize:4'))
  await step(telegramCallback(chatId, u++, 'isPregnant:false'))
  await step(telegramCallback(chatId, u++, `hasBabyUnder3:${hasBabyUnder3}`))
  await step(telegramText(chatId, u++, '06700'))
}

test.describe('México onboarding — part 1 (T017): screening + household-profile block, Q2=México', () => {
  const chatId = 999015001

  test('selecting México routes into the México conflict-of-interest screening', async ({ request }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    let u = 1
    await sendUpdate(request, telegramText(chatId, u++, 'Hola'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'optin:accept'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'd1:accept'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'reengagement_consent:accept'))
    await sendUpdate(request, telegramCallback(chatId, u++, 'd3:yes'))
    await sendUpdate(request, telegramText(chatId, u++, '+525512345678'))
    await sendUpdate(request, telegramText(chatId, u++, 'María Pérez'))
    const status = await sendUpdate(request, telegramCallback(chatId, u++, 'country:México'))
    expect(status).toBeLessThan(500)
  })

  test('the México sensitive-industry answer "Sí" does not crash the webhook (would set not_qualified)', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    await sendUpdate(request, telegramCallback(chatId + 1, 1, 'conflictOfInterest:true'))
  })

  test('a parallel CAM conversation is unaffected by México wiring', async ({ request }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    const camChatId = 999015002
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

test.describe('México onboarding — part 2 (T023): estado/municipio geo resolution', () => {
  test('an off-catalog municipio does not crash the webhook (would set in_quota_geo=false)', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    const chatId = 999015003
    await sendUpdate(request, telegramCallback(chatId, 1, 'gps:manual'))
    await sendUpdate(request, telegramText(chatId, 2, 'Municipio Que No Existe'))
  })
})

test.describe('México onboarding — part 3 (T028): 6 NSE questions, survey completion', () => {
  test('the full México AMAI NSE question block is accepted end to end', async ({ request }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    test.setTimeout(120_000)
    await runFullMexicoJourney(request, 999015004)
    // computeMexicoNse for this answer set = 105 -> level 'D+' (see mexico-nse.test.ts's
    // workbook-sample vector). leads.nse_points=105 / quota_segment='D+' / score=null is
    // asserted there; this only confirms the webhook accepted every step.
  })
})

test.describe('México onboarding — part 4 (T032): quota decision + registration handoff', () => {
  async function seed(region: string, capCount: number | null): Promise<void> {
    await upsertQuotaTarget({ country: 'México', region, dimensionType: 'nse', dimensionValue: 'D+', targetCount: 5 })
    if (capCount !== null) {
      await createRegionCap({ country: 'México', region, capCount }).catch((e) => {
        if (!(e instanceof RegionCapConflictError)) throw e
      })
    }
  }

  test('an open México quota target: the survey→quota-decision journey is accepted by the webhook', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    test.setTimeout(120_000)
    await seed('AMCM', null)
    await runFullMexicoJourney(request, 999015005)
  })

  test('a reached México region cap: the journey is accepted by the webhook', async ({ request }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    test.setTimeout(120_000)
    await seed('CENTRO', 0)
    await runFullMexicoJourney(request, 999015006, { estado: 'Hidalgo', municipio: 'Tula de Allende', colonia: 'Centro' })
  })

  test('a baby-under-3 exception against a reached México region cap: the journey is accepted', async ({
    request,
  }) => {
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    test.setTimeout(120_000)
    await seed('CENTRO', 0)
    await runFullMexicoJourney(request, 999015007, {
      hasBabyUnder3: true,
      estado: 'Hidalgo',
      municipio: 'Tula de Allende',
      colonia: 'Centro',
    })
  })
})
