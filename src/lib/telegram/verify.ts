import { env } from '@/lib/env'

export function verifyTelegramWebhook(request: Request): boolean {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  return secret === env.TELEGRAM_WEBHOOK_SECRET
}
