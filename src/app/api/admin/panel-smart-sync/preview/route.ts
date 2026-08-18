import { NextRequest, NextResponse } from 'next/server'
import { previewPanelSmartSync } from '@/lib/panel-smart/sync'

/**
 * Read-only preview of the manual "sync now" trigger — auth is handled by middleware.ts
 * (matches /api/admin/:path*), same as every other admin API route.
 *
 * Returns the exact `{lead_id, responses}` payload that `run/route.ts` would send, without
 * sending it. Only imports `panel-smart/sync.ts`, never `panel-smart/client.ts` or
 * `tdm-registration/oauth.ts` — so the OAuth token/client secret never enter this response.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { leadId?: string }
  if (!body.leadId) {
    return NextResponse.json({ error: 'leadId requerido' }, { status: 400 })
  }

  // force: true — this route is only ever called from the conversation page's
  // "Sincronizar a TDM" button, which should always preview the full answer set, not
  // just the diff since the last sync.
  const preview = await previewPanelSmartSync(body.leadId, { force: true })
  return NextResponse.json(preview)
}
