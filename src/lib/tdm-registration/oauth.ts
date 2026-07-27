import { env } from '@/lib/env'

interface CachedToken {
  accessToken: string
  expiresAt: number
}

const TOKEN_TIMEOUT_MS = 5000
/** Refresh this long before actual expiry, so a request never races a token that just died. */
const REFRESH_SKEW_MS = 60_000

let cached: CachedToken | null = null

interface TokenResponse {
  access_token: string
  expires_in: number
}

/**
 * Azure AD (Microsoft Entra ID) client-credentials grant — TDM requires a bearer token
 * from their tenant before /api/ai-lead will accept a request. Cached in-memory per warm
 * instance and refreshed proactively (REFRESH_SKEW_MS before expiry) so a hot path of
 * registration-code requests doesn't re-authenticate on every call.
 */
export async function getTdmAccessToken(): Promise<string> {
  const now = Date.now()
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > now) {
    return cached.accessToken
  }

  const body = new URLSearchParams({
    client_id: env.TDM_OAUTH_CLIENT_ID!,
    client_secret: env.TDM_OAUTH_CLIENT_SECRET!,
    scope: env.TDM_OAUTH_SCOPE!,
    grant_type: 'client_credentials',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS)
  try {
    const res = await fetch(env.TDM_OAUTH_TOKEN_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`TDM OAuth token request failed: ${res.status} ${text}`)
    }
    const data = (await res.json()) as TokenResponse
    cached = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 }
    return cached.accessToken
  } finally {
    clearTimeout(timeout)
  }
}

/** Test-only escape hatch — clears the module-level cache between test cases. */
export function resetTdmAccessTokenCache(): void {
  cached = null
}
