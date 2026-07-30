import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles, fichaHogarProfiles } from '@/lib/db/schema'
import { logCall } from '@/lib/db/call-log'
import { isPanelSmartSyncEnabled } from '@/lib/env'
import { SURVEY_FIELDS, FICHA_HOGAR_FIELDS } from '@/types/lead'
import type { Lead, SurveyProfile, FichaHogarProfile } from '@/types/lead'
import { buildResponseItem, type SyncableFieldName } from './question-map'
import { syncToPanelSmart } from './client'
import type { PanelSmartResponseItem } from './types'

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

/**
 * Sends only the lead's changed/new survey + ficha-hogar answers to Kantar's
 * /api/ai-lead-responses, diffed against `leads.panelSmartSyncedAnswersJson`. No-ops (returns
 * `true`) when disabled/unconfigured, or when nothing is actually pending — safe to call
 * from every phase-completion transition, every correction commit, and the hourly
 * abandoned-conversation sweep alike, without ever over-sending. On failure the snapshot
 * is left untouched so the same fields stay "pending" for the next attempt. Never throws;
 * every attempt (success or failure) is logged via `logCall`.
 */
export async function syncPendingPanelSmartAnswers(leadId: string, correlationId: string): Promise<boolean> {
  if (!isPanelSmartSyncEnabled()) return true

  const start = Date.now()
  try {
    const lead = await loadLead(leadId)
    if (!lead) return false

    const profile = await loadSurveyProfile(leadId)
    const fichaHogar = await loadFichaHogarProfile(leadId)

    const pending = computePendingFields(profile, fichaHogar, lead.panelSmartSyncedAnswersJson)
    if (pending.length === 0) return true

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
    return true
  } catch (err) {
    await markFailed(leadId).catch(() => {})
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
