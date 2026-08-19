import { env, isMetaWhatsAppConfigured } from '@/lib/env'

export function requireMeta(): void {
  if (!isMetaWhatsAppConfigured()) {
    throw new Error(
      'WhatsApp Business (Meta) is not configured (set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET)',
    )
  }
}

export function graphMessagesUrl(): string {
  requireMeta()
  const version = env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'
  return `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

// Meta error codes that specifically signal a policy/quality-rating risk (as opposed to
// a transient network/config error) — worth its own log event so it doesn't get lost
// among ordinary send failures. See Meta's WhatsApp Cloud API error code reference.
const POLICY_RISK_ERROR_CODES: Record<number, string> = {
  368: 'account_restricted_or_banned',
  131047: 'outside_24h_window_requires_template',
  131049: 'per_user_marketing_template_limit',
  130472: 'business_eligibility_or_experiment_restriction',
}

export async function graphSend(payload: Record<string, unknown>): Promise<string | undefined> {
  requireMeta()
  const res = await fetch(graphMessagesUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string; code?: number }
  }
  if (!res.ok) {
    const code = data.error?.code
    if (code !== undefined && code in POLICY_RISK_ERROR_CODES) {
      console.error(
        JSON.stringify({
          event: 'whatsapp_policy_risk_error',
          code,
          reason: POLICY_RISK_ERROR_CODES[code],
          message: data.error?.message,
          timestamp: new Date().toISOString(),
        }),
      )
    }
    throw new Error(
      `Meta Graph error: ${res.status} ${data.error?.message ?? JSON.stringify(data)}`,
    )
  }
  return data.messages?.[0]?.id
}
