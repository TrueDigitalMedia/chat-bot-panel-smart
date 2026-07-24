import { eq } from 'drizzle-orm'
import type { ExecuteValues, RowDataPacket } from 'mysql2/promise'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles, fichaHogarProfiles } from '@/lib/db/schema'
import { logCall } from '@/lib/db/call-log'
import { getClientMysqlPool, isClientMysqlSyncEnabled } from './client'
import { buildLeadRow } from './field-map'
import type { TbLeadsAgenteIaRow } from './types'
import type { FichaHogarProfile, Lead, SurveyProfile } from '@/types/lead'

async function loadLead(leadId: string): Promise<Lead | null> {
  const [row] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1)
  return (row as Lead) ?? null
}

async function loadSurveyProfile(leadId: string): Promise<SurveyProfile | null> {
  const [row] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, leadId)).limit(1)
  return (row as SurveyProfile) ?? null
}

async function loadFichaHogarProfile(leadId: string): Promise<FichaHogarProfile | null> {
  const [row] = await db.select().from(fichaHogarProfiles).where(eq(fichaHogarProfiles.leadId, leadId)).limit(1)
  return (row as FichaHogarProfile) ?? null
}

async function markSynced(leadId: string, tdmLeadId: number): Promise<void> {
  await db
    .update(leads)
    .set({ tdmLeadId, tdmSyncStatus: 'synced', tdmLastSyncAt: new Date() })
    .where(eq(leads.id, leadId))
}

async function markFailed(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({ tdmSyncStatus: 'failed', tdmLastSyncAt: new Date() })
    .where(eq(leads.id, leadId))
}

function rowEntries(row: TbLeadsAgenteIaRow): [string, ExecuteValues][] {
  return Object.entries(row).map(([key, value]) => [key, (value ?? null) as ExecuteValues])
}

/**
 * INSERT a full row into tb_leads_agente_ia. `id` is a plain `int NOT NULL PRIMARY KEY`
 * on the real table — no AUTO_INCREMENT, no default (confirmed via `SHOW CREATE TABLE`,
 * 2026-07-22) — so we must assign one ourselves: `MAX(id) + 1`, read and inserted inside
 * one transaction on our single-connection pool (client.ts's `connectionLimit: 1`) to
 * close the read-then-write race against our own concurrent requests. This can't
 * protect against TDM's own internal process inserting concurrently on their side; a
 * genuine collision surfaces as a primary-key violation (thrown, caught by syncLead's
 * caller) rather than silently overwriting their row, which is the best we can do
 * without TDM exposing a real id-allocation mechanism.
 */
async function insertRow(row: TbLeadsAgenteIaRow): Promise<number> {
  const pool = getClientMysqlPool()
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.execute<RowDataPacket[]>('SELECT MAX(id) AS maxId FROM tb_leads_agente_ia FOR UPDATE')
    const id = (rows[0]?.maxId as number | null ?? 0) + 1
    // Only known once `id` is computed above — stamp it here rather than in
    // buildLeadRow, which never sees the not-yet-assigned id on a first sync.
    row.thread_id = id
    row.display_thread_id = id
    const entries = rowEntries(row)
    const columns = ['id', ...entries.map(([c]) => c)]
    const placeholders = columns.map(() => '?').join(', ')
    await conn.execute(
      `INSERT INTO tb_leads_agente_ia (${columns.join(', ')}) VALUES (${placeholders})`,
      [id, ...entries.map(([, v]) => v)] as ExecuteValues[],
    )
    await conn.commit()
    return id
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

/** Plain UPDATE of an existing row, keyed by its MySQL id. */
async function updateRow(tdmLeadId: number, row: TbLeadsAgenteIaRow): Promise<void> {
  const entries = rowEntries(row)
  const assignments = entries.map(([c]) => `${c} = ?`).join(', ')
  const values = [...entries.map(([, v]) => v), tdmLeadId] as ExecuteValues[]
  const pool = getClientMysqlPool()
  await pool.execute(`UPDATE tb_leads_agente_ia SET ${assignments} WHERE id = ?`, values)
}

/**
 * UPDATE the existing TDM row when `existingTdmLeadId` is known, else fall back to an
 * INSERT (covers a lead whose first sync attempt never succeeded — data-model.md §4).
 * Returns the id to persist locally either way.
 */
async function upsertRow(existingTdmLeadId: number | null, row: TbLeadsAgenteIaRow): Promise<number> {
  if (existingTdmLeadId != null) {
    await updateRow(existingTdmLeadId, row)
    return existingTdmLeadId
  }
  return insertRow(row)
}

/**
 * Syncs a lead's CURRENT state to `tb_leads_agente_ia` — called once per status
 * transition from `transitionLead` (`src/lib/state-machine/index.ts`), so every phase
 * outcome syncs, qualified or not (spec 010 amendment: "todo registro cuenta como lead
 * así no califique como panelista"). INSERTs on the lead's first-ever sync, UPDATEs the
 * same row (keyed by `tdmLeadId`) on every subsequent one — the fallback logic in
 * `upsertRow` already handles both without the caller needing to know which applies.
 *
 * No-op (returns `true` immediately) when sync is disabled/unconfigured. Never throws;
 * every attempt is logged via `logCall`.
 */
export async function syncLead(leadId: string, correlationId: string): Promise<boolean> {
  if (!isClientMysqlSyncEnabled()) return true

  const start = Date.now()
  try {
    const lead = await loadLead(leadId)
    if (!lead) return false

    // `upsertLead` always creates an empty survey_profiles row on first contact
    // (src/lib/db/leads.ts) — this should never actually be null, but don't sync a
    // malformed row if it somehow is.
    const profile = await loadSurveyProfile(leadId)
    if (!profile) return false

    const fichaHogar = await loadFichaHogarProfile(leadId)
    const isFirstSync = lead.tdmLeadId == null

    const row = buildLeadRow(lead, profile, fichaHogar, isFirstSync, lead.tdmLeadId)
    const tdmLeadId = await upsertRow(lead.tdmLeadId, row)

    await markSynced(leadId, tdmLeadId)
    await logCall({
      leadId,
      callType: 'tdm_mysql_sync',
      latencyMs: Date.now() - start,
      correlationId,
    })
    return true
  } catch (err) {
    await markFailed(leadId).catch(() => {})
    await logCall({
      leadId,
      callType: 'tdm_mysql_sync',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
