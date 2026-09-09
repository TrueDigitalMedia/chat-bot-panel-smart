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
  rawRequestUrl?: string,
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

    // Account/token are already confirmed correct in prod, so the mismatch is the URL
    // string Twilio signed vs. the one we reconstruct. Twilio signs the EXACT URL
    // configured on the number / Messaging Service (scheme, host, path, trailing slash,
    // query all included). Brute-force the likely variants and report which one — if any
    // — matches, so the fix is just "set the Messaging Service webhook / TWILIO_WEBHOOK_URL
    // to this string".
    const bases = new Set<string>([url])
    if (rawRequestUrl) {
      bases.add(rawRequestUrl)
      bases.add(rawRequestUrl.split('?')[0])
    }
    const candidates = new Set<string>()
    for (const b of bases) {
      candidates.add(b)
      candidates.add(b.endsWith('/') ? b.slice(0, -1) : `${b}/`)
      candidates.add(b.replace(/^https:/, 'http:'))
      if (params.To) candidates.add(`${b.split('?')[0]}?To=${encodeURIComponent(params.To)}`)
    }
    const urlMatch =
      [...candidates].find((c) => {
        try {
          return twilio.validateRequest(env.TWILIO_AUTH_TOKEN!, signature, c, params)
        } catch {
          return false
        }
      }) ?? null

    console.warn('[whatsapp:twilio:signature] debug', {
      url,
      rawRequestUrl: rawRequestUrl ?? null,
      receivedSignature: signature,
      expectedSignature: expected,
      matches: expected === signature,
      // The URL variant that DOES validate — point the Twilio webhook (or
      // TWILIO_WEBHOOK_URL) at exactly this. null ⇒ it's not a URL variant we tried
      // (params/body issue, or a wholly different host).
      urlThatMatches: urlMatch,
      resolvedFrom: env.TWILIO_WEBHOOK_URL
        ? 'TWILIO_WEBHOOK_URL'
        : env.APP_BASE_URL
          ? 'APP_BASE_URL'
          : 'requestUrl',
      twilioWebhookUrlEnv: env.TWILIO_WEBHOOK_URL ?? null,
      appBaseUrlEnv: env.APP_BASE_URL ?? null,
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
