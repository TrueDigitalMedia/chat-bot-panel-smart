import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  leads,
  surveyProfiles,
  fichaHogarProfiles,
  panelSmartSyncRuns,
  panelSmartSyncAttempts,
} from '@/lib/db/schema'
import { logCall } from '@/lib/db/call-log'
import { isPanelSmartSyncEnabled } from '@/lib/env'
import { SURVEY_FIELDS, FICHA_HOGAR_FIELDS } from '@/types/lead'
import type { Lead, SurveyProfile, FichaHogarProfile } from '@/types/lead'
import { buildResponseItem, type SyncableFieldName } from './question-map'
import { syncToPanelSmart } from './client'
import type { PanelSmartResponseItem } from './types'

export type PanelSmartSyncTrigger = 'state_transition' | 'correction' | 'abandoned_cron' | 'manual'

export interface PanelSmartSyncOptions {
  trigger: PanelSmartSyncTrigger
  /** Pass an existing run id to group this attempt into a batch (the abandoned-sync
   *  cron creates one run up front and passes it to every lead in its sweep). Omitted
   *  for single-lead triggers (state transition / correction), which get their own run. */
  runId?: string
}

async function loadLead(leadId: string): Promise<Lead | null> {
  const [row] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1)
  return (row as Lead) ?? null
}

async function loadSurveyProfile(leadId: string): Promise<SurveyProfile | null> {
  const [row] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, leadId)).limit(1)
  return (row as SurveyProfile) ?? null
}

async function loadFichaHogarProfile(leadId: string): Promise<FichaHogarProfile | null> {
  const [row] = await db
    .select()
    .from(fichaHogarProfiles)
    .where(eq(fichaHogarProfiles.leadId, leadId))
    .limit(1)
  return (row as FichaHogarProfile) ?? null
}

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string' && v.trim() === '') return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return a === b
}

/** Diffs current survey + ficha-hogar answers against the last-synced snapshot. */
function computePendingFields(
  profile: SurveyProfile | null,
  fichaHogar: FichaHogarProfile | null,
  synced: Record<string, unknown> | null,
): Array<{ field: SyncableFieldName; value: unknown }> {
  const pending: Array<{ field: SyncableFieldName; value: unknown }> = []
  const snapshot = synced ?? {}

  if (profile) {
    const rec = profile as unknown as Record<string, unknown>
    for (const field of SURVEY_FIELDS) {
      const value = rec[field]
      if (!hasValue(value)) continue
      if (!valuesEqual(value, snapshot[field])) pending.push({ field, value })
    }
  }

  if (fichaHogar) {
    const rec = fichaHogar as unknown as Record<string, unknown>
    for (const field of FICHA_HOGAR_FIELDS) {
      const value = rec[field]
      if (!hasValue(value)) continue
      if (!valuesEqual(value, snapshot[field])) pending.push({ field, value })
    }
  }

  return pending
}

async function markSynced(leadId: string, snapshot: Record<string, unknown>): Promise<void> {
  await db
    .update(leads)
    .set({
      panelSmartSyncStatus: 'synced',
      panelSmartLastSyncAt: new Date(),
      panelSmartSyncedAnswersJson: snapshot,
    })
    .where(eq(leads.id, leadId))
}

async function markFailed(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({ panelSmartSyncStatus: 'failed', panelSmartLastSyncAt: new Date() })
    .where(eq(leads.id, leadId))
}

/** Creates a new sync run (a single-lead execution — the cron creates its own batch run
 *  directly, up front, covering many leads). */
export async function createPanelSmartSyncRun(
  trigger: PanelSmartSyncTrigger,
  totalCount: number,
): Promise<string> {
  const [row] = await db
    .insert(panelSmartSyncRuns)
    .values({ trigger, totalCount })
    .returning({ id: panelSmartSyncRuns.id })
  return row.id
}

/** Stamps the run's finish time — synced/failed counts are kept accurate incrementally
 *  by recordSyncAttempt below, including the edge case where a whole batch had nothing
 *  pending for any lead (no attempts recorded at all, so nothing else would ever set it). */
export async function finishPanelSmartSyncRun(runId: string): Promise<void> {
  await db.update(panelSmartSyncRuns).set({ finishedAt: new Date() }).where(eq(panelSmartSyncRuns.id, runId))
}

async function recordSyncAttempt(
  runId: string,
  leadId: string,
  status: 'synced' | 'failed',
  fieldsSynced: string[],
  error: string | null,
): Promise<void> {
  await db.insert(panelSmartSyncAttempts).values({
    runId,
    leadId,
    status,
    fieldsSyncedJson: fieldsSynced,
    error,
  })
  await db
    .update(panelSmartSyncRuns)
    .set({
      finishedAt: new Date(),
      syncedCount: sql`${panelSmartSyncRuns.syncedCount} + ${status === 'synced' ? 1 : 0}`,
      failedCount: sql`${panelSmartSyncRuns.failedCount} + ${status === 'failed' ? 1 : 0}`,
    })
    .where(eq(panelSmartSyncRuns.id, runId))
}

/**
 * Sends only the lead's changed/new survey + ficha-hogar answers to Kantar's
 * /api/ai-lead-responses, diffed against `leads.panelSmartSyncedAnswersJson`. No-ops (returns
 * `true`) when disabled/unconfigured, or when nothing is actually pending — safe to call
 * from every phase-completion transition, every correction commit, and the hourly
 * abandoned-conversation sweep alike, without ever over-sending. On failure the snapshot
 * is left untouched so the same fields stay "pending" for the next attempt. Never throws;
 * every attempt (success or failure) is logged via `logCall`.
 */
export async function syncPendingPanelSmartAnswers(
  leadId: string,
  correlationId: string,
  opts: PanelSmartSyncOptions,
): Promise<boolean> {
  if (!isPanelSmartSyncEnabled()) return true

  const start = Date.now()
  let runId: string | undefined
  let fieldNames: string[] = []
  try {
    const lead = await loadLead(leadId)
    if (!lead) return false

    const profile = await loadSurveyProfile(leadId)
    const fichaHogar = await loadFichaHogarProfile(leadId)

    const pending = computePendingFields(profile, fichaHogar, lead.panelSmartSyncedAnswersJson)
    if (pending.length === 0) return true

    fieldNames = pending.map(({ field }) => field)
    runId = opts.runId ?? (await createPanelSmartSyncRun(opts.trigger, 1))

    const responses: PanelSmartResponseItem[] = pending.map(({ field, value }) => buildResponseItem(field, value))

    // Add lead_status as a response
    responses.push({
      codigo_pregunta: 'lead_status',
      pregunta: 'Estado del Lead',
      respuesta: lead.leadStatus,
    })

    // Add ficha_hogar_completada status
    responses.push({
      codigo_pregunta: 'ficha_hogar_completada',
      pregunta: '¿Ficha Hogar Completada?',
      respuesta: fichaHogar?.completedAt ? 'Sí' : 'No',
    })

    await syncToPanelSmart({ lead_id: leadId, responses })

    const snapshot = { ...(lead.panelSmartSyncedAnswersJson ?? {}) }
    for (const { field, value } of pending) snapshot[field] = value
    await markSynced(leadId, snapshot)

    await logCall({ leadId, callType: 'panel_smart_sync', latencyMs: Date.now() - start, correlationId })
    await recordSyncAttempt(runId, leadId, 'synced', fieldNames, null).catch(() => {})
    return true
  } catch (err) {
    await markFailed(leadId).catch(() => {})
    if (runId) {
      await recordSyncAttempt(runId, leadId, 'failed', fieldNames, String(err)).catch(() => {})
    }
    await logCall({
      leadId,
      callType: 'panel_smart_sync',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
