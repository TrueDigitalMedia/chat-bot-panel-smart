import { env, isPanelSmartSyncConfigured } from '@/lib/env'
import { getTdmAccessToken } from '@/lib/tdm-registration/oauth'
import type { PanelSmartSyncPayload } from './types'

// Same Azure Function App as TDM's /api/ai-lead (tdm-registration/client.ts measured ~6.4s
// there) — matching its generous timeout since this is also called from a background job,
// never a user-facing response. Increased to 30s due to occasional Panel Smart slowness.
const DEFAULT_TIMEOUT_MS = 30000

export function requirePanelSmartSyncConfigured(): void {
  if (!isPanelSmartSyncConfigured()) {
    throw new Error(
      'Panel Smart sync not fully configured (set PANEL_SMART_SYNC_URL plus the TDM_OAUTH_* vars — same tenant as TDM_REGISTRATION_REQUEST_URL)',
    )
  }
}

/**
 * POSTs the {lead_id, responses[]} JSON to Kantar's /api/ai-lead-responses, authenticated with
 * a bearer token from the same Azure AD tenant as TDM's registration-code endpoint (see
 * tdm-registration/oauth.ts). Throws on any non-2xx, token failure, or network/timeout
 * failure — callers (panel-smart/sync.ts) catch and log rather than propagate.
 */
export async function syncToPanelSmart(payload: PanelSmartSyncPayload): Promise<void> {
  requirePanelSmartSyncConfigured()

  const accessToken = await getTdmAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(env.PANEL_SMART_SYNC_URL!, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Panel Smart sync failed: ${res.status} ${text}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}
