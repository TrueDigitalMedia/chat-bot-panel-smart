import { test, expect } from '@playwright/test'

/** Manual skip path smoke (Quickstart C/D/E). Catalog unit tests cover hit/miss. */
test.describe('NSE geo — manual skip (smoke)', () => {
  test('webhook accepts Escribir mi ubicación text', async ({ request }) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    test.skip(!secret, 'TELEGRAM_WEBHOOK_SECRET required')
    const chatId = 999002003
    const res = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': secret! },
      data: {
        update_id: Date.now(),
        message: {
          message_id: 1,
          from: { id: chatId, is_bot: false, first_name: 'Manual' },
          chat: { id: chatId, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'Escribir mi ubicación',
        },
      },
    })
    expect(res.status()).toBeLessThan(400)
  })
})
