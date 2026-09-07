import { env, isPanelSmartSyncConfigured } from '@/lib/env'
import { getTdmAccessToken } from '@/lib/tdm-registration/oauth'
import type { PanelSmartSyncPayload } from './types'

// Same Azure Function App as TDM's /api/ai-lead. Background job, never user-facing —
// but a request that hasn't answered in 20s is the Panel Smart side overloaded /
// deadlocking (see the 2026-09 audit: ~24% failure, minutes-long hangs at the old 30s),
// and failing fast frees the serverless invocation. The sync is idempotent (diffs
// against the last-sent snapshot) so a timed-out attempt just retries next transition.
const DEFAULT_TIMEOUT_MS = 20000

/** Retries a transient MySQL deadlock (error 1213) on the Panel Smart side, which the
 *  2026-09 audit showed spiking under load. Everything else fails through immediately. */
const DEADLOCK_RETRIES = 2

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
  const body = JSON.stringify(payload)

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      const res = await fetch(env.PANEL_SMART_SYNC_URL!, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      if (res.ok) return
      const text = await res.text().catch(() => '')
      const isDeadlock = res.status === 500 && /\b1213\b|deadlock/i.test(text)
      if (isDeadlock && attempt < DEADLOCK_RETRIES) {
        await new Promise((r) => setTimeout(r, 300 + attempt * 500))
        continue
      }
      throw new Error(`Panel Smart sync failed: ${res.status} ${text}`)
    } finally {
      clearTimeout(timeout)
    }
  }
}
