import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, quotaPeriodSnapshots, surveyProfiles } from '@/lib/db/schema'
import {
  getQuotaPeriodOrThrow,
  getOpenPeriod,
  listQuotaPeriods,
  markPeriodClosed,
  markPeriodOpen,
  QuotaPeriodError,
  type QuotaPeriodListFilters,
  type QuotaPeriodRow,
} from '@/lib/quotas/quota-periods'
import { listQuotaProgress, QUALIFIED_STATUSES, type QuotaProgress } from '@/lib/quotas/quota-progress'
import { listRegionObjectives, type RegionObjectiveRow } from '@/lib/quotas/region-caps'

/**
 * El "corte" de un periodo — spec 018.
 *
 * Capa ALTA: importa quota-periods, quota-progress y region-caps. Está separada de
 * quota-periods.ts precisamente para que esos dos puedan importar de allá sin ciclo.
 */

export interface SnapshotRow {
  /** 'region' = una fila por país+región; 'cell' = una por celda de dimensión. */
  scope: 'region' | 'cell'
  country: string
  region: string
  /** '' en las filas de región (no NULL — ver el comentario del índice único en la migración). */
  dimensionType: string
  dimensionValue: string
  objective: number
  achieved: number
  missing: number
  progressPct: number
  source: string | null
  deactivated: boolean
}

export interface CutTotals {
  objective: number
  achieved: number
  /** Σ de los déficits POR REGIÓN — un excedente en una región no tapa el faltante de otra. */
  missing: number
  /**
   * Σ de los excedentes por región: leads calificados por encima del objetivo de su región,
   * incluidos los de regiones con objetivo 0 (sobre-entrega histórica).
   *
   * Sin esta columna la fila de totales parece un error de aritmética: Costa Rica cerraba
   * 358 objetivo / 159 conseguidos / 255 faltante porque "Area metropolitana III" tiene objetivo 0
   * y 56 leads. Con `excess` la identidad vuelve a cerrar:
   * `objective = achieved - excess + missing`.
   */
  excess: number
  progressPct: number
}

function pct(achieved: number, objective: number): number {
  return objective > 0 ? Math.min(100, Math.round((achieved / objective) * 100)) : 0
}

/**
 * Las cifras del corte, como función PURA — así la aritmética del corte se testea sin DB, igual
 * que toProgress().
 *
 * Las filas `region` y `cell` son niveles independientes: la Σ de las celdas NO tiene por qué
 * igualar la fila de región, porque los leads que califican por la excepción de embarazo/bebé
 * cuentan en la región y en ninguna celda.
 */
export function buildPeriodSnapshotRows(
  regions: RegionObjectiveRow[],
  cells: QuotaProgress[],
): SnapshotRow[] {
  const regionRows: SnapshotRow[] = regions.map((r) => ({
    scope: 'region',
    country: r.country,
    region: r.region,
    dimensionType: '',
    dimensionValue: '',
    objective: r.objective,
    achieved: r.achieved,
    missing: Math.max(0, r.objective - r.achieved),
    progressPct: pct(r.achieved, r.objective),
    source: r.source,
    deactivated: r.deactivated,
  }))

  const cellRows: SnapshotRow[] = cells.map((c) => ({
    scope: 'cell',
    country: c.country,
    region: c.region,
    dimensionType: c.dimensionType,
    dimensionValue: c.dimensionValue,
    objective: c.target,
    achieved: c.achieved,
    missing: c.available,
    progressPct: c.progressPct,
    source: null,
    deactivated: !c.active,
  }))

  return [...regionRows, ...cellRows]
}

/**
 * Los totales del corte se suman sobre las filas de REGIÓN, no sobre las celdas: el objetivo por
 * región es el techo duro que pidió el cliente, y su "conseguidos" incluye los leads de la
 * excepción, que no viven en ninguna celda.
 */
export function totalsFromSnapshot(rows: SnapshotRow[]): CutTotals {
  const regionRows = rows.filter((r) => r.scope === 'region')
  const objective = regionRows.reduce((sum, r) => sum + r.objective, 0)
  const achieved = regionRows.reduce((sum, r) => sum + r.achieved, 0)
  return {
    objective,
    achieved,
    missing: regionRows.reduce((sum, r) => sum + r.missing, 0),
    excess: regionRows.reduce((sum, r) => sum + Math.max(0, r.achieved - r.objective), 0),
    progressPct: pct(achieved, objective),
  }
}

async function readSnapshot(periodId: string): Promise<SnapshotRow[]> {
  const rows = await db
    .select()
    .from(quotaPeriodSnapshots)
    .where(eq(quotaPeriodSnapshots.periodId, periodId))
  return rows.map((r) => ({
    scope: r.scope as 'region' | 'cell',
    country: r.country,
    region: r.region,
    dimensionType: r.dimensionType,
    dimensionValue: r.dimensionValue,
    objective: r.objective,
    achieved: r.achieved,
    missing: r.missing,
    progressPct: r.progressPct,
    source: r.source,
    deactivated: r.deactivated,
  }))
}

/**
 * Etiqueta de la fila que recoge los leads del periodo que no caen en ninguna región del corte.
 * Cadena vacía (no NULL) por la misma razón que `dimension_type`: así el índice único la trata
 * como una fila más y un cierre reintentado no la duplica.
 */
export const UNASSIGNED_REGION = ''

/**
 * Leads calificados del periodo que `listRegionObjectives` no cuenta en ninguna región — en la
 * práctica, los que tienen `survey_profiles.nse_region` nulo (datos previos al gate de región) o
 * una región sin ninguna configuración en este periodo.
 *
 * Sin esta fila el corte los perdía en silencio mientras el export CSV sí los traía: Guatemala
 * cerraba 116 conseguidos contra 121 leads en el CSV (2026-10-01). Un corte que no cuadra con su
 * propia lista de leads no sirve como libro mayor.
 */
async function countUnassignedLeads(periodId: string, regionAchieved: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.quotaPeriodId, periodId), inArray(leads.leadStatus, QUALIFIED_STATUSES)))
  return Math.max(0, (row?.count ?? 0) - regionAchieved)
}

/** Las cifras EN VIVO de un periodo — lo que se congela al cerrar. */
async function computeLiveSnapshot(periodId: string): Promise<SnapshotRow[]> {
  const [regions, cells] = await Promise.all([
    listRegionObjectives({ periodId }),
    listQuotaProgress({ periodId }),
  ])
  const rows = buildPeriodSnapshotRows(regions, cells)

  const regionAchieved = regions.reduce((sum, r) => sum + r.achieved, 0)
  const unassigned = await countUnassignedLeads(periodId, regionAchieved)
  if (unassigned > 0) {
    rows.push({
      scope: 'region',
      country: regions[0]?.country ?? '',
      region: UNASSIGNED_REGION,
      dimensionType: '',
      dimensionValue: '',
      objective: 0,
      achieved: unassigned,
      missing: 0,
      progressPct: 0,
      source: 'none',
      deactivated: false,
    })
  }
  return rows
}

export interface CloseQuotaPeriodResult {
  period: QuotaPeriodRow
  snapshot: SnapshotRow[]
  totals: CutTotals
  /** true si ya estaba cerrado: se devuelve el corte guardado sin recalcular nada. */
  alreadyClosed: boolean
}

/**
 * Cierra el periodo y congela el corte.
 *
 * El orden importa: primero se escribe el snapshot, DESPUÉS se cambia el estado. Si el proceso
 * muere en el medio, el periodo sigue abierto y reintentar es seguro.
 *
 * Idempotente: sobre un periodo ya cerrado devuelve el snapshot guardado tal cual, sin
 * recalcular — un corte que se mueve no es un corte.
 *
 * No destructivo: NO apaga `quota_targets.active` ni toca `leads.quota_period_id`. Apagar
 * `active` borraría el registro de qué líneas estaban abiertas al momento del cierre, que es
 * justamente lo que guarda la columna `deactivated` del snapshot.
 *
 * OJO (operativo): al cerrar, el país queda sin periodo abierto y por lo tanto CERRADO — ningún
 * lead nuevo califica hasta que se abra el siguiente.
 */
export async function closeQuotaPeriod(id: string): Promise<CloseQuotaPeriodResult> {
  const period = await getQuotaPeriodOrThrow(id)

  if (period.status === 'closed') {
    const snapshot = await readSnapshot(id)
    return { period, snapshot, totals: totalsFromSnapshot(snapshot), alreadyClosed: true }
  }

  // Se calcula con las MISMAS funciones que renderiza el panel, así el corte no puede discrepar
  // de los números que el operador estaba viendo cuando apretó el botón.
  const snapshot = await computeLiveSnapshot(id)

  if (snapshot.length > 0) {
    await db
      .insert(quotaPeriodSnapshots)
      .values(snapshot.map((r) => ({ periodId: id, ...r })))
      .onConflictDoNothing()
  }

  const closed = await markPeriodClosed(id)
  if (!closed) {
    // 0 filas = otro cierre concurrente ganó. Re-leer y responder idempotentemente.
    const current = await getQuotaPeriodOrThrow(id)
    const stored = await readSnapshot(id)
    return { period: current, snapshot: stored, totals: totalsFromSnapshot(stored), alreadyClosed: true }
  }

  return { period: closed, snapshot, totals: totalsFromSnapshot(snapshot), alreadyClosed: false }
}

/**
 * Reabre un periodo cerrado y BORRA su corte.
 *
 * Existe porque alguien va a cerrar un trimestre por error, y sin esto la única recuperación es
 * SQL a mano en producción. El snapshot se borra en vez de conservarse: es un valor derivado, y
 * un corte rancio al lado de un periodo vivo es peor que no tener corte.
 */
export async function reopenQuotaPeriod(id: string): Promise<QuotaPeriodRow> {
  const period = await getQuotaPeriodOrThrow(id)
  if (period.status !== 'closed') {
    throw new QuotaPeriodError('period_not_closed', `El periodo ${period.label} no está cerrado`)
  }

  const blocking = await getOpenPeriod(period.country)
  if (blocking) {
    throw new QuotaPeriodError(
      'period_already_open',
      `${period.country} ya tiene un periodo abierto (${blocking.label}) — cerralo antes de reabrir ${period.label}`,
      { openPeriodId: blocking.id },
    )
  }

  await db.delete(quotaPeriodSnapshots).where(eq(quotaPeriodSnapshots.periodId, id))

  const reopened = await markPeriodOpen(id)
  if (!reopened) {
    // Carrera: alguien lo reabrió o lo movió entre el chequeo y el update.
    return getQuotaPeriodOrThrow(id)
  }
  return reopened
}

export interface PeriodCut {
  period: QuotaPeriodRow
  totals: CutTotals
  regions: SnapshotRow[]
  cells: SnapshotRow[]
  /** true cuando el periodo sigue abierto: las cifras son del momento, todavía se mueven. */
  preliminary: boolean
}

/** El corte de un periodo: congelado si está cerrado, en vivo (preliminar) si sigue abierto. */
export async function getPeriodCut(id: string): Promise<PeriodCut> {
  const period = await getQuotaPeriodOrThrow(id)
  const preliminary = period.status === 'open'
  const rows = preliminary ? await computeLiveSnapshot(id) : await readSnapshot(id)

  const byRegion = (a: SnapshotRow, b: SnapshotRow) =>
    a.country.localeCompare(b.country) ||
    a.region.localeCompare(b.region) ||
    a.dimensionType.localeCompare(b.dimensionType) ||
    a.dimensionValue.localeCompare(b.dimensionValue)

  return {
    period,
    totals: totalsFromSnapshot(rows),
    regions: rows.filter((r) => r.scope === 'region').sort(byRegion),
    cells: rows.filter((r) => r.scope === 'cell').sort(byRegion),
    preliminary,
  }
}

export interface QuotaPeriodWithProgress extends QuotaPeriodRow {
  objective: number
  achieved: number
  missing: number
  progressPct: number
  preliminary: boolean
}

/**
 * Los periodos con sus cifras, para el listado del panel. Los cerrados leen su snapshot (una
 * query para todos juntos); los abiertos se calculan en vivo.
 */
export async function listQuotaPeriodsWithProgress(
  filters: QuotaPeriodListFilters = {},
): Promise<QuotaPeriodWithProgress[]> {
  const periods = await listQuotaPeriods(filters)
  if (periods.length === 0) return []

  const closedIds = periods.filter((p) => p.status === 'closed').map((p) => p.id)
  const storedByPeriod = new Map<string, SnapshotRow[]>()
  if (closedIds.length > 0) {
    const rows = await db
      .select()
      .from(quotaPeriodSnapshots)
      .where(and(inArray(quotaPeriodSnapshots.periodId, closedIds), eq(quotaPeriodSnapshots.scope, 'region')))
    for (const r of rows) {
      const list = storedByPeriod.get(r.periodId) ?? []
      list.push({
        scope: 'region',
        country: r.country,
        region: r.region,
        dimensionType: r.dimensionType,
        dimensionValue: r.dimensionValue,
        objective: r.objective,
        achieved: r.achieved,
        missing: r.missing,
        progressPct: r.progressPct,
        source: r.source,
        deactivated: r.deactivated,
      })
      storedByPeriod.set(r.periodId, list)
    }
  }

  // Los abiertos: una sola pasada de listRegionObjectives para TODOS, no una por periodo.
  const openIds = periods.filter((p) => p.status === 'open').map((p) => p.id)
  const liveByPeriod = new Map<string, RegionObjectiveRow[]>()
  if (openIds.length > 0) {
    for (const row of await listRegionObjectives({ periodIds: openIds })) {
      const list = liveByPeriod.get(row.periodId) ?? []
      list.push(row)
      liveByPeriod.set(row.periodId, list)
    }
  }

  return periods.map((p) => {
    const rows =
      p.status === 'closed'
        ? (storedByPeriod.get(p.id) ?? [])
        : buildPeriodSnapshotRows(liveByPeriod.get(p.id) ?? [], [])
    return { ...p, ...totalsFromSnapshot(rows), preliminary: p.status === 'open' }
  })
}

export interface CutLeadRow {
  leadId: string
  channel: string
  phoneNumber: string | null
  leadStatus: string
  statusReason: string | null
  country: string | null
  nseRegion: string | null
  quotaSegment: string | null
  quotaMatchedDimension: string | null
  quotaMatchedValue: string | null
  createdAt: Date
}

/**
 * Los leads del corte — "que se realice un corte de esos leads".
 *
 * Se reconstruyen desde el sello `leads.quota_period_id` en vez de guardarse copiados al cerrar:
 * una copia congelada de filas de lead empezaría a discrepar de `leads` en cuanto un lead avance
 * de estado después del cierre (p. ej. a `ficha_hogar_descartado`), y tendríamos dos verdades.
 * Los enteros congelados del snapshot son el libro mayor; esta lista es la verdad actual.
 */
export async function listCutLeads(periodId: string): Promise<CutLeadRow[]> {
  return db
    .select({
      leadId: leads.id,
      channel: leads.channel,
      phoneNumber: leads.phoneNumber,
      leadStatus: leads.leadStatus,
      statusReason: leads.statusReason,
      country: surveyProfiles.country,
      nseRegion: surveyProfiles.nseRegion,
      quotaSegment: leads.quotaSegment,
      quotaMatchedDimension: leads.quotaMatchedDimension,
      quotaMatchedValue: leads.quotaMatchedValue,
      createdAt: leads.createdAt,
    })
    .from(leads)
    // leftJoin, no innerJoin: el total del corte cuenta los leads por su sello de periodo, sin
    // pasar por survey_profiles. Si algún lead calificado quedara sin perfil, un innerJoin lo
    // dejaría afuera de esta lista y el CSV no cuadraría con su propio total. Con leftJoin aparece
    // igual, con país y región en blanco.
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(and(eq(leads.quotaPeriodId, periodId), inArray(leads.leadStatus, QUALIFIED_STATUSES)))
    .orderBy(surveyProfiles.country, surveyProfiles.nseRegion, leads.createdAt)
}
