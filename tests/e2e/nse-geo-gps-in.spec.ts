import { test, expect } from '@playwright/test'

/**
 * GPS in-catalog path (Quickstart A).
 * Full funnel requires Telegram outbound + Nominatim; this smoke-tests webhook accepts location updates.
 */
test.describe('NSE geo — GPS in catalog (smoke)', () => {
  const chatId = 999002001

  test('webhook accepts message.location without 4xx', async ({ request }) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')

    const res = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': secret! },
      data: {
        update_id: Date.now(),
        message: {
          message_id: 1,
          from: { id: chatId, is_bot: false, first_name: 'GpsIn' },
          chat: { id: chatId, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          location: { latitude: 14.6302, longitude: -90.6067 },
        },
      },
    })
    expect(res.status()).toBeLessThan(400)
  })
})
