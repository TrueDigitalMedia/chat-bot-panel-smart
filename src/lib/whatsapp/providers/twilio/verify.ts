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
  const ok = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params)
  if (!ok && env.TWILIO_SIGNATURE_DEBUG) {
    // Diagnostic only — enable TWILIO_SIGNATURE_DEBUG=1 locally to see why validation
    // fails (wrong auth token vs wrong URL vs mangled params). Never enable in prod.
    let expected = '(unavailable)'
    try {
      expected = twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, url, params)
    } catch {
      /* older twilio lib without the helper */
    }
    console.warn('[whatsapp:twilio:signature] debug', {
      url,
      receivedSignature: signature,
      expectedSignature: expected,
      matches: expected === signature,
      paramKeys: Object.keys(params).sort(),
      from: params.From,
      to: params.To,
      authTokenTail: env.TWILIO_AUTH_TOKEN.slice(-4),
      // AccountSid / MessagingServiceSid are identifiers, not secrets — logged in full so
      // a Messaging-Service webhook signed by a subaccount can be told apart from a stale
      // Auth Token. `accountSidMatches` false ⇒ set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN
      // to the account whose SID is in `paramAccountSid`.
      paramAccountSid: params.AccountSid ?? null,
      envAccountSid: env.TWILIO_ACCOUNT_SID ?? null,
      accountSidMatches: Boolean(params.AccountSid && params.AccountSid === env.TWILIO_ACCOUNT_SID),
      messagingServiceSid: params.MessagingServiceSid ?? null,
    })
  }
  return ok
}

export function resolveTwilioWebhookUrl(requestUrl: string): string {
  if (env.TWILIO_WEBHOOK_URL) return env.TWILIO_WEBHOOK_URL
  if (env.APP_BASE_URL) {
    const path = new URL(requestUrl).pathname
    return `${env.APP_BASE_URL.replace(/\/$/, '')}${path}`
  }
  return requestUrl.split('?')[0]
}
