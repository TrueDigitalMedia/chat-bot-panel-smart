import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, panelSmartSyncRuns } from '@/lib/db/schema'
import { generateCorrelationId } from '@/lib/correlation'
import {
  syncPendingPanelSmartAnswers,
  createPanelSmartSyncRun,
  finishPanelSmartSyncRun,
  type PanelSmartSyncTrigger,
} from './sync'

const INACTIVITY_THRESHOLD_MS = 60 * 60 * 1000

export interface SweepResult {
  runId: string | null
  scanned: number
  synced: number
  failed: number
}

/**
 * Finds every lead with a pending Panel Smart diff (never synced, or synced before their
 * last activity) and syncs each one under a single shared run — shared by the abandoned-
 * conversation cron (jobs/panel-smart-abandoned-sync) and the "sync now" admin button
 * (api/admin/panel-smart-sync/run).
 *
 * `onlyStale` additionally requires 1h+ of inactivity — the cron's definition of
 * "abandoned". A manual trigger passes `false` to flush everything pending right now,
 * active conversations included, rather than waiting for them to go quiet.
 */
export async function sweepPendingLeads(trigger: PanelSmartSyncTrigger, onlyStale: boolean): Promise<SweepResult> {
  const pendingCondition = or(
    isNull(leads.panelSmartLastSyncAt),
    lt(leads.panelSmartLastSyncAt, leads.lastActivityAt),
  )
  const staleThreshold = new Date(Date.now() - INACTIVITY_THRESHOLD_MS)

  const targetLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(onlyStale ? and(lt(leads.lastActivityAt, staleThreshold), pendingCondition) : pendingCondition)

  if (targetLeads.length === 0) {
    return { runId: null, scanned: 0, synced: 0, failed: 0 }
  }

  const runId = await createPanelSmartSyncRun(trigger, targetLeads.length)

  for (const lead of targetLeads) {
    const correlationId = generateCorrelationId()
    await syncPendingPanelSmartAnswers(lead.id, correlationId, { trigger, runId })
  }

  await finishPanelSmartSyncRun(runId)

  // Read back the run's own counts rather than tallying syncPendingPanelSmartAnswers's
  // return value locally — that boolean is `true` both for a genuine sync and for a no-op
  // (nothing actually pending), which would make this summary disagree with what the run's
  // own attempts table (and the sync-history UI) shows for the same run.
  const [finalRun] = await db
    .select({ syncedCount: panelSmartSyncRuns.syncedCount, failedCount: panelSmartSyncRuns.failedCount })
    .from(panelSmartSyncRuns)
    .where(eq(panelSmartSyncRuns.id, runId))
    .limit(1)

  return {
    runId,
    scanned: targetLeads.length,
    synced: finalRun?.syncedCount ?? 0,
    failed: finalRun?.failedCount ?? 0,
  }
}
