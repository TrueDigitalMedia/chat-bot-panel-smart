import { NextRequest, NextResponse } from 'next/server'
import { syncPendingPanelSmartAnswers } from '@/lib/panel-smart/sync'
import { sweepPendingLeads } from '@/lib/panel-smart/sweep'
import { getLeadById } from '@/lib/db/leads'
import { generateCorrelationId } from '@/lib/correlation'

/**
 * Manual "sync now" trigger for the admin UI — auth is handled by middleware.ts
 * (matches /api/admin/:path*), same as every other admin API route.
 *
 * Body `{ leadId }` syncs just that lead right away (single-lead run, trigger 'manual').
 * Empty body sweeps every lead with a pending diff, active conversations included —
 * unlike the abandoned-sync cron, this doesn't require 1h of inactivity first.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { leadId?: string } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  if (body.leadId) {
    const ok = await syncPendingPanelSmartAnswers(body.leadId, generateCorrelationId(), { trigger: 'manual' })
    const lead = await getLeadById(body.leadId)
    return NextResponse.json({
      ok,
      status: lead?.panelSmartSyncStatus ?? null,
      lastSyncAt: lead?.panelSmartLastSyncAt ?? null,
    })
  }

  const result = await sweepPendingLeads('manual', false)
  return NextResponse.json(result)
}
