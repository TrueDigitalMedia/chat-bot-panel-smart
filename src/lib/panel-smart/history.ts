import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { panelSmartSyncRuns, panelSmartSyncAttempts, leads, surveyProfiles } from '@/lib/db/schema'
import type { PanelSmartSyncTrigger } from './sync'

export interface SyncRunLead {
  id: string
  fullName: string | null
  phoneNumber: string | null
  channelUsername: string | null
}

export interface SyncRunListItem {
  id: string
  trigger: PanelSmartSyncTrigger
  startedAt: Date
  finishedAt: Date | null
  totalCount: number
  syncedCount: number
  failedCount: number
  /** Only populated for single-lead executions (totalCount === 1) — lets the list row
   *  show the lead directly without an extra click into the run's detail page. */
  lead: SyncRunLead | null
}

export interface ListSyncRunsOptions {
  trigger?: PanelSmartSyncTrigger
  onlyFailed?: boolean
  limit?: number
}

/** Runs ordered newest-first — one row per sync execution (single-lead transition/
 *  correction, or one pass of the abandoned-conversation cron). */
export async function listSyncRuns(opts: ListSyncRunsOptions = {}): Promise<SyncRunListItem[]> {
  const { trigger, onlyFailed, limit = 100 } = opts

  const conditions = []
  if (trigger) conditions.push(eq(panelSmartSyncRuns.trigger, trigger))
  if (onlyFailed) conditions.push(gt(panelSmartSyncRuns.failedCount, 0))

  const runs = await db
    .select()
    .from(panelSmartSyncRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(panelSmartSyncRuns.startedAt))
    .limit(limit)

  if (runs.length === 0) return []

  const singleLeadRunIds = runs.filter((r) => r.totalCount === 1).map((r) => r.id)
  const leadByRun = new Map<string, SyncRunLead>()

  if (singleLeadRunIds.length > 0) {
    const rows = await db
      .select({
        runId: panelSmartSyncAttempts.runId,
        leadId: leads.id,
        phoneNumber: leads.phoneNumber,
        channelUsername: leads.channelUsername,
        fullName: surveyProfiles.fullName,
      })
      .from(panelSmartSyncAttempts)
      .innerJoin(leads, eq(leads.id, panelSmartSyncAttempts.leadId))
      .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
      .where(inArray(panelSmartSyncAttempts.runId, singleLeadRunIds))

    for (const row of rows) {
      leadByRun.set(row.runId, {
        id: row.leadId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        channelUsername: row.channelUsername,
      })
    }
  }

  return runs.map((r) => ({
    id: r.id,
    trigger: r.trigger as PanelSmartSyncTrigger,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    totalCount: r.totalCount,
    syncedCount: r.syncedCount,
    failedCount: r.failedCount,
    lead: leadByRun.get(r.id) ?? null,
  }))
}

export interface SyncAttemptItem {
  id: string
  leadId: string
  status: 'synced' | 'failed'
  fieldsSynced: string[]
  error: string | null
  createdAt: Date
  lead: SyncRunLead
}

export interface SyncRunDetail {
  id: string
  trigger: PanelSmartSyncTrigger
  startedAt: Date
  finishedAt: Date | null
  totalCount: number
  syncedCount: number
  failedCount: number
  attempts: SyncAttemptItem[]
}

/** A single run plus every lead synced (or attempted) within it. */
export async function getSyncRunWithAttempts(runId: string): Promise<SyncRunDetail | null> {
  const [run] = await db.select().from(panelSmartSyncRuns).where(eq(panelSmartSyncRuns.id, runId)).limit(1)
  if (!run) return null

  const rows = await db
    .select({
      id: panelSmartSyncAttempts.id,
      leadId: panelSmartSyncAttempts.leadId,
      status: panelSmartSyncAttempts.status,
      fieldsSyncedJson: panelSmartSyncAttempts.fieldsSyncedJson,
      error: panelSmartSyncAttempts.error,
      createdAt: panelSmartSyncAttempts.createdAt,
      phoneNumber: leads.phoneNumber,
      channelUsername: leads.channelUsername,
      fullName: surveyProfiles.fullName,
    })
    .from(panelSmartSyncAttempts)
    .innerJoin(leads, eq(leads.id, panelSmartSyncAttempts.leadId))
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(eq(panelSmartSyncAttempts.runId, runId))
    .orderBy(desc(panelSmartSyncAttempts.createdAt))

  return {
    id: run.id,
    trigger: run.trigger as PanelSmartSyncTrigger,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    totalCount: run.totalCount,
    syncedCount: run.syncedCount,
    failedCount: run.failedCount,
    attempts: rows.map((r) => ({
      id: r.id,
      leadId: r.leadId,
      status: r.status as 'synced' | 'failed',
      fieldsSynced: (r.fieldsSyncedJson as string[] | null) ?? [],
      error: r.error,
      createdAt: r.createdAt,
      lead: { id: r.leadId, fullName: r.fullName, phoneNumber: r.phoneNumber, channelUsername: r.channelUsername },
    })),
  }
}
