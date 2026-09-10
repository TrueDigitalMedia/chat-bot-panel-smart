import twilio from 'twilio'
import { env, isTwilioConfigured } from '@/lib/env'

/**
 * Twilio signs the webhook request against the EXACT URL configured on the number /
 * Messaging Service — scheme, host, path, trailing slash and query string all included.
 * Behind Vercel's proxy the URL our handler reconstructs from `request.url` +
 * `TWILIO_WEBHOOK_URL` does not always match that byte-for-byte:
 *   - a number pointed at `/api/webhooks/whatsapp` while `TWILIO_WEBHOOK_URL` names the
 *     `/api/webhooks/whatsapp/twilio` alternative path (or vice-versa) — the real cause
 *     of the 403s in the Sept 2026 audit;
 *   - `x-forwarded-host` vs the internal host in `request.url`;
 *   - trailing-slash and http/https normalization by the proxy.
 *
 * Rather than guess one canonical string, validate the signature against every plausible
 * variant and accept if ANY matches — the same brute-force the old `TWILIO_SIGNATURE_DEBUG`
 * block did for diagnostics, promoted to the actual check. All candidates are still bound
 * by the shared Auth Token, so this widens only the URL surface, not trust.
 */
export function twilioWebhookUrlCandidates(request: { url: string; headers: Headers }): string[] {
  const reqUrl = new URL(request.url)
  const h = request.headers
  const first = (v: string | null) => v?.split(',')[0]?.trim() || undefined

  const path = reqUrl.pathname
  const search = reqUrl.search // normally empty — our webhooks are configured without a query string

  const hosts = new Set<string>()
  const fwdHost = first(h.get('x-forwarded-host'))
  if (fwdHost) hosts.add(fwdHost)
  const hostHeader = first(h.get('host'))
  if (hostHeader) hosts.add(hostHeader)
  hosts.add(reqUrl.host)
  for (const envUrl of [env.TWILIO_WEBHOOK_URL, env.APP_BASE_URL]) {
    if (!envUrl) continue
    try {
      hosts.add(new URL(envUrl).host)
    } catch {
      /* malformed env — ignore */
    }
  }

  const protos = new Set<string>(['https'])
  const fwdProto = first(h.get('x-forwarded-proto'))
  if (fwdProto) protos.add(fwdProto)
  protos.add(reqUrl.protocol.replace(':', ''))

  const out = new Set<string>()
  for (const proto of protos) {
    for (const host of hosts) {
      const base = `${proto}://${host}${path}`
      out.add(base)
      out.add(base.endsWith('/') ? base.slice(0, -1) : `${base}/`)
      if (search) out.add(`${proto}://${host}${path}${search}`)
    }
  }
  // The configured value verbatim, in case it carries a path/suffix none of the above reconstruct.
  if (env.TWILIO_WEBHOOK_URL) out.add(env.TWILIO_WEBHOOK_URL)

  return [...out]
}

/**
 * Validate a Twilio webhook signature.
 * @param signature `X-Twilio-Signature` header value
 * @param urls one or more absolute URLs to try (see `twilioWebhookUrlCandidates`)
 * @param params POST body as a key/value map
 */
export function verifyTwilioSignature(
  signature: string | null,
  urls: string | string[],
  params: Record<string, string>,
): boolean {
  if (!isTwilioConfigured() || !env.TWILIO_AUTH_TOKEN) return false
  if (!signature) return false

  const candidates = Array.isArray(urls) ? urls : [urls]
  const token = env.TWILIO_AUTH_TOKEN

  for (const url of candidates) {
    try {
      if (twilio.validateRequest(token, signature, url, params)) return true
    } catch {
      /* bad URL string — try the next candidate */
    }
  }

  // Nothing matched — always emit a one-line warning (prod-visible), and the full
  // per-candidate breakdown only when TWILIO_SIGNATURE_DEBUG is set.
  console.warn('[whatsapp:twilio:signature] invalid', {
    triedCandidates: candidates.length,
    receivedSignatureTail: signature.slice(-6),
    authTokenTail: token.slice(-4),
    paramAccountSid: params.AccountSid ?? null,
    accountSidMatches: Boolean(params.AccountSid && params.AccountSid === env.TWILIO_ACCOUNT_SID),
  })
  if (env.TWILIO_SIGNATURE_DEBUG) {
    for (const url of candidates) {
      let expected = '(unavailable)'
      try {
        expected = twilio.getExpectedTwilioSignature(token, url, params)
      } catch {
        /* older twilio lib */
      }
      console.warn('[whatsapp:twilio:signature] debug candidate', {
        url,
        expected,
        matches: expected === signature,
      })
    }
    console.warn('[whatsapp:twilio:signature] debug context', {
      messagingServiceSid: params.MessagingServiceSid ?? null,
      from: params.From,
      to: params.To,
      paramKeys: Object.keys(params).sort(),
    })
  }
  return false
}
