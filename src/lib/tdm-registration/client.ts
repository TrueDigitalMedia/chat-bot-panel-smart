import { env, isTdmRegistrationRequestConfigured } from '@/lib/env'
import { getTdmAccessToken } from './oauth'
import type { RegistrationCodeRequestPayload } from './types'

const DEFAULT_TIMEOUT_MS = 5000

export function requireTdmRegistrationConfigured(): void {
  if (!isTdmRegistrationRequestConfigured()) {
    throw new Error(
      'TDM registration request not fully configured (set TDM_REGISTRATION_REQUEST_URL, TDM_OAUTH_TOKEN_URL, TDM_OAUTH_CLIENT_ID, TDM_OAUTH_CLIENT_SECRET, TDM_OAUTH_SCOPE)',
    )
  }
}

/**
 * POSTs the registration-code request JSON to TDM's /api/ai-lead, authenticated with a
 * bearer token from their Azure AD tenant (client-credentials grant, see oauth.ts).
 * Fire-and-forget from the caller's perspective — the code itself arrives later via
 * POST /api/webhooks/tdm-registration-code, not in this response. Throws on any non-2xx,
 * token failure, or network/timeout failure so the QStash job calling this can retry
 * (see jobs/re-engage.ts `request_registration_code`).
 */
export async function requestRegistrationCode(payload: RegistrationCodeRequestPayload): Promise<void> {
  requireTdmRegistrationConfigured()

  const accessToken = await getTdmAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(env.TDM_REGISTRATION_REQUEST_URL!, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`TDM registration request failed: ${res.status} ${text}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}
