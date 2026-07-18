import twilio from 'twilio'
import { env, isTwilioConfigured } from '@/lib/env'

/**
 * Validate Twilio webhook signature.
 * @param signature X-Twilio-Signature header
 * @param url Absolute public webhook URL (must match Console config)
 * @param params POST body as key/value map
 */
export function verifyTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!isTwilioConfigured() || !env.TWILIO_AUTH_TOKEN) return false
  if (!signature) return false
  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params)
}

export function resolveTwilioWebhookUrl(requestUrl: string): string {
  if (env.TWILIO_WEBHOOK_URL) return env.TWILIO_WEBHOOK_URL
  if (env.APP_BASE_URL) {
    const path = new URL(requestUrl).pathname
    return `${env.APP_BASE_URL.replace(/\/$/, '')}${path}`
  }
  return requestUrl.split('?')[0]
}
