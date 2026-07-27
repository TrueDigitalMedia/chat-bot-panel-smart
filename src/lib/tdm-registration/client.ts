import { env, isTdmRegistrationRequestConfigured } from '@/lib/env'
import type { RegistrationCodeRequestPayload } from './types'

const DEFAULT_TIMEOUT_MS = 5000

export function requireTdmRegistrationConfigured(): void {
  if (!isTdmRegistrationRequestConfigured()) {
    throw new Error('TDM registration request endpoint not configured (set TDM_REGISTRATION_REQUEST_URL)')
  }
}

/**
 * POSTs the registration-code request JSON to TDM. Fire-and-forget from the caller's
 * perspective — the code itself arrives later via POST /api/webhooks/tdm-registration-code,
 * not in this response. Throws on any non-2xx or network/timeout failure so the QStash
 * job calling this can retry (see jobs/re-engage.ts `request_registration_code`).
 */
export async function requestRegistrationCode(payload: RegistrationCodeRequestPayload): Promise<void> {
  requireTdmRegistrationConfigured()

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // TBD — TDM hasn't specified their outbound auth mechanism yet; this generic
  // "header name + value" shape covers an API key or bearer token once they do.
  if (env.TDM_REGISTRATION_REQUEST_AUTH_HEADER && env.TDM_REGISTRATION_REQUEST_AUTH_VALUE) {
    headers[env.TDM_REGISTRATION_REQUEST_AUTH_HEADER] = env.TDM_REGISTRATION_REQUEST_AUTH_VALUE
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
