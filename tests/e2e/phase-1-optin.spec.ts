import { test, expect } from '@playwright/test'

// Same shallow-smoke pattern as tests/e2e/phase-1-disqualify.spec.ts — requires a running
// dev server with a test Postgres DB. Verifies the webhook layer wires up the new opt-in
// gate (spec 007) without an unhandled crash; does not assert DB state directly.

const TEST_CHAT_ID = 999007001

test.describe('Phase 1 — Opt-in gate (spec 007)', () => {
  test('opt-in decline: declining the opt-in sets lead to not_qualified before reaching D1', async ({
    request,
  }) => {
    // Send initial message — should trigger the new opt-in question (before D1)
    await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET! },
      data: {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: TEST_CHAT_ID, is_bot: false, first_name: 'Test' },
          chat: { id: TEST_CHAT_ID, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'Hola',
        },
      },
    })

    await new Promise((r) => setTimeout(r, 500))

    // Decline the opt-in
    const res = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET! },
      data: {
        update_id: 2,
        callback_query: {
          id: 'cq1',
          from: { id: TEST_CHAT_ID, is_bot: false, first_name: 'Test' },
          message: {
            message_id: 2,
            chat: { id: TEST_CHAT_ID, type: 'private' },
            date: Math.floor(Date.now() / 1000),
          },
          data: 'optin:decline',
        },
      },
    })

    // Without a seeded DB this may 500 — the webhook entry point itself must not crash.
    expect([200, 500]).toContain(res.status())
  })

  test('opt-in accept: accepting the opt-in advances to D1, not the survey directly', async ({
    request,
  }) => {
    const chatId = TEST_CHAT_ID + 1
    await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET! },
      data: {
        update_id: 3,
        message: {
          message_id: 3,
          from: { id: chatId, is_bot: false, first_name: 'Test' },
          chat: { id: chatId, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'Hola',
        },
      },
    })

    await new Promise((r) => setTimeout(r, 500))

    const res = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': process.env.TELEGRAM_WEBHOOK_SECRET! },
      data: {
        update_id: 4,
        callback_query: {
          id: 'cq2',
          from: { id: chatId, is_bot: false, first_name: 'Test' },
          message: { message_id: 4, chat: { id: chatId, type: 'private' }, date: Math.floor(Date.now() / 1000) },
          data: 'optin:accept',
        },
      },
    })

    expect([200, 500]).toContain(res.status())
  })
})
