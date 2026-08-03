import { NextRequest, NextResponse } from 'next/server'
import { and, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { syncPendingPanelSmartAnswers, createPanelSmartSyncRun, finishPanelSmartSyncRun } from '@/lib/panel-smart/sync'
import { generateCorrelationId } from '@/lib/correlation'

const INACTIVITY_THRESHOLD_MS = 60 * 60 * 1000

/**
 * QStash recurring schedule (every 3 hours, configured via upstash CLI or API):
 * flushes Panel Smart sync for conversations that went quiet for 1h+ without finishing
 * a phase — the normal sync hooks (transitionLead, correction commits) only fire on those
 * specific events, so a lead that stalls mid-phase would otherwise sit with unsynced
 * answers indefinitely.
 *
 * Pre-filters to leads whose last activity happened after their last successful sync (so a
 * diff might actually be non-empty) — syncPendingPanelSmartAnswers itself is the source of
 * truth and no-ops safely if nothing's actually pending, but this keeps the sweep from
 * reloading every historical lead.
 *
 * Auth: QStash signs requests with `Authorization: Bearer $CRON_SECRET`, and the schedule
 * is set up once via `upstash qstash schedule create`. See ./QSTASH_SETUP.md for instructions.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staleThreshold = new Date(Date.now() - INACTIVITY_THRESHOLD_MS)

  const staleLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        lt(leads.lastActivityAt, staleThreshold),
        or(isNull(leads.panelSmartLastSyncAt), lt(leads.panelSmartLastSyncAt, leads.lastActivityAt)),
      ),
    )

  const runId = staleLeads.length > 0 ? await createPanelSmartSyncRun('abandoned_cron', staleLeads.length) : null

  let synced = 0
  let failed = 0
  for (const lead of staleLeads) {
    const correlationId = generateCorrelationId()
    const ok = await syncPendingPanelSmartAnswers(lead.id, correlationId, {
      trigger: 'abandoned_cron',
      runId: runId!,
    })
    if (ok) synced += 1
    else failed += 1
  }

  if (runId) await finishPanelSmartSyncRun(runId)

  return NextResponse.json({ scanned: staleLeads.length, synced, failed })
}
