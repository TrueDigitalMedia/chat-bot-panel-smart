import { test, expect } from '@playwright/test'

/** GPS outside catalog path (Quickstart B) — location webhook smoke. */
test.describe('NSE geo — GPS out of catalog (smoke)', () => {
  const chatId = 999002002

  test('webhook accepts location for out-of-sample coords', async ({ request }) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')

    const res = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': secret! },
      data: {
        update_id: Date.now(),
        message: {
          message_id: 1,
          from: { id: chatId, is_bot: false, first_name: 'GpsOut' },
          chat: { id: chatId, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          location: { latitude: 40.7128, longitude: -74.006 },
        },
      },
    })
    expect(res.status()).toBeLessThan(400)
  })
})
