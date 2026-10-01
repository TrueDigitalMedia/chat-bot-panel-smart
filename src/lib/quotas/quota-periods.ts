import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaPeriods } from '@/lib/db/schema'
import { canonicalCountry } from '@/lib/geo/cam-nse-catalog'
import { isSupportedCountry } from '@/lib/countries/registry'

/**
 * Periodos de cuota (Q1-Q4) por país — spec 018.
 *
 * Este módulo es deliberadamente la capa BAJA: no importa quota-progress.ts ni region-caps.ts,
 * porque esos dos sí importan de acá (para resolver "el periodo abierto" por defecto). El corte
 * en sí — cerrar, reabrir, congelar el snapshot — vive en quota-cuts.ts, que puede importar
 * todo sin generar un ciclo.
 */

export type QuotaPeriodStatus = 'open' | 'closed'

export interface QuotaPeriodRow {
  id: string
  country: string
  label: string
  year: number
  quarter: number
  /** 'YYYY-MM-DD' — metadata descriptiva, el motor de decisión no la lee nunca (ver §3.3). */
  startsOn: string
  endsOn: string
  status: QuotaPeriodStatus
  openedAt: Date
  closedAt: Date | null
  notes: string | null
}

export type QuotaPeriodErrorCode =
  | 'invalid_country'
  | 'invalid_quarter'
  | 'invalid_year'
  | 'invalid_date_range'
  | 'duplicate_label'
  | 'period_already_open'
  | 'period_not_open'
  | 'period_not_closed'

export class QuotaPeriodError extends Error {
  code: QuotaPeriodErrorCode
  /** El periodo abierto que bloquea la operación — para que la UI pueda linkearlo. */
  openPeriodId?: string

  constructor(code: QuotaPeriodErrorCode, message: string, extra?: { openPeriodId?: string }) {
    super(message)
    this.code = code
    this.openPeriodId = extra?.openPeriodId
  }
}

export class QuotaPeriodNotFoundError extends Error {}

/** Postgres unique-violation — el índice parcial `quota_periods_one_open_per_country_idx`. */
const PG_UNIQUE_VIOLATION = '23505'

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === PG_UNIQUE_VIOLATION
}

type PeriodSelect = typeof quotaPeriods.$inferSelect

function toRow(row: PeriodSelect): QuotaPeriodRow {
  return {
    id: row.id,
    country: row.country,
    label: row.label,
    year: row.year,
    quarter: row.quarter,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    status: row.status as QuotaPeriodStatus,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    notes: row.notes,
  }
}

export interface QuotaPeriodListFilters {
  country?: string
  status?: QuotaPeriodStatus
}

/** Abiertos primero, y dentro de cada país el más reciente arriba. */
export async function listQuotaPeriods(filters: QuotaPeriodListFilters = {}): Promise<QuotaPeriodRow[]> {
  const conditions = []
  if (filters.country) conditions.push(eq(quotaPeriods.country, filters.country))
  if (filters.status) conditions.push(eq(quotaPeriods.status, filters.status))

  const rows = await db
    .select()
    .from(quotaPeriods)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(quotaPeriods.country), desc(quotaPeriods.startsOn), desc(quotaPeriods.createdAt))

  return rows.map(toRow)
}

export async function getQuotaPeriod(id: string): Promise<QuotaPeriodRow | null> {
  const [row] = await db.select().from(quotaPeriods).where(eq(quotaPeriods.id, id)).limit(1)
  return row ? toRow(row) : null
}

export async function getQuotaPeriodOrThrow(id: string): Promise<QuotaPeriodRow> {
  const row = await getQuotaPeriod(id)
  if (!row) throw new QuotaPeriodNotFoundError(`Quota period not found: ${id}`)
  return row
}

/**
 * El periodo abierto del país, o null si no hay — en cuyo caso el país está CERRADO y ningún
 * lead nuevo califica (decisión de producto, spec 018 §2).
 *
 * Deliberadamente SIN caché a nivel de módulo: un lambda caliente seguiría sirviendo un periodo
 * que el operador acaba de cerrar, o sea seguiría reclutando contra un trimestre cerrado — el
 * peor modo de falla de esta feature. Es una query de una fila por índice; checkQuotaAvailability
 * la llama una sola vez por chequeo y propaga la fila a sus helpers.
 */
export async function getOpenPeriod(country: string): Promise<QuotaPeriodRow | null> {
  if (!country) return null
  const [row] = await db
    .select()
    .from(quotaPeriods)
    .where(and(eq(quotaPeriods.country, country), eq(quotaPeriods.status, 'open')))
    .limit(1)
  return row ? toRow(row) : null
}

/**
 * Todos los periodos abiertos, indexados por país, en UNA query. Las páginas del admin listan
 * varios países a la vez; pedirlos de a uno reabre el problema de "Too many connections
 * attempts" de Neon que ya está documentado en countAchievedMap().
 */
export async function getOpenPeriodsByCountry(): Promise<Map<string, QuotaPeriodRow>> {
  const rows = await db.select().from(quotaPeriods).where(eq(quotaPeriods.status, 'open'))
  return new Map(rows.map((r) => [r.country, toRow(r)]))
}

/** Los ids de todos los periodos abiertos — el scope por defecto de las lecturas del panel. */
export async function listOpenPeriodIds(country?: string): Promise<string[]> {
  const conditions = [eq(quotaPeriods.status, 'open')]
  if (country) conditions.push(eq(quotaPeriods.country, country))
  const rows = await db.select({ id: quotaPeriods.id }).from(quotaPeriods).where(and(...conditions))
  return rows.map((r) => r.id)
}

/** Etiqueta (país, label) de varios periodos de una sola vez — para render y logs. */
export async function getQuotaPeriodsByIds(ids: string[]): Promise<Map<string, QuotaPeriodRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select().from(quotaPeriods).where(inArray(quotaPeriods.id, ids))
  return new Map(rows.map((r) => [r.id, toRow(r)]))
}

export interface OpenQuotaPeriodInput {
  country: string
  quarter: number
  year: number
  /** 'YYYY-MM-DD'. */
  startsOn: string
  endsOn: string
  /** Por defecto `Q{quarter} {year}`. */
  label?: string
  notes?: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Abre un periodo. Arranca VACÍO a propósito: no se copian las líneas del Q anterior ni se
 * arrastra el faltante (decisión de producto #3) — los objetivos se cargan después a mano o con
 * el importador de Excel. Hasta que se carguen, todas las regiones del país leen CERRADA, que es
 * la semántica buscada.
 */
export async function openQuotaPeriod(input: OpenQuotaPeriodInput): Promise<QuotaPeriodRow> {
  const country = canonicalCountry(input.country) ?? input.country
  if (!isSupportedCountry(country)) {
    throw new QuotaPeriodError('invalid_country', `Unrecognized country: ${input.country}`)
  }
  if (!Number.isInteger(input.quarter) || input.quarter < 1 || input.quarter > 4) {
    throw new QuotaPeriodError('invalid_quarter', 'quarter must be an integer between 1 and 4')
  }
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new QuotaPeriodError('invalid_year', 'year must be an integer between 2000 and 2100')
  }
  if (!ISO_DATE.test(input.startsOn) || !ISO_DATE.test(input.endsOn)) {
    throw new QuotaPeriodError('invalid_date_range', 'startsOn and endsOn must be YYYY-MM-DD dates')
  }
  if (input.endsOn < input.startsOn) {
    throw new QuotaPeriodError('invalid_date_range', 'endsOn must be on or after startsOn')
  }

  const label = (input.label ?? `Q${input.quarter} ${input.year}`).trim()
  if (!label) {
    throw new QuotaPeriodError('duplicate_label', 'label must not be empty')
  }

  // Pre-chequeo solo para dar un error útil; la garantía real es el índice único parcial.
  const existingOpen = await getOpenPeriod(country)
  if (existingOpen) {
    throw new QuotaPeriodError(
      'period_already_open',
      `${country} ya tiene un periodo abierto (${existingOpen.label}) — cerralo antes de abrir otro`,
      { openPeriodId: existingOpen.id },
    )
  }

  try {
    const [row] = await db
      .insert(quotaPeriods)
      .values({
        country,
        label,
        year: input.year,
        quarter: input.quarter,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: 'open',
        notes: input.notes ?? null,
      })
      .returning()
    return toRow(row)
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    // Puede ser el índice parcial (carrera con otro abrir) o el (country, label).
    const raced = await getOpenPeriod(country)
    if (raced) {
      throw new QuotaPeriodError(
        'period_already_open',
        `${country} ya tiene un periodo abierto (${raced.label})`,
        { openPeriodId: raced.id },
      )
    }
    throw new QuotaPeriodError('duplicate_label', `${country} ya tiene un periodo llamado "${label}"`)
  }
}

/**
 * Flip del estado a 'closed', condicionado a que siga abierto. Devuelve null si 0 filas — es
 * decir, otro cierre concurrente ganó; el llamador re-lee y responde idempotentemente.
 * Bajo nivel a propósito: la secuencia completa del corte vive en quota-cuts.ts.
 */
export async function markPeriodClosed(id: string): Promise<QuotaPeriodRow | null> {
  const [row] = await db
    .update(quotaPeriods)
    .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotaPeriods.id, id), eq(quotaPeriods.status, 'open')))
    .returning()
  return row ? toRow(row) : null
}

/** Vuelve el periodo a 'open' y limpia `closed_at`. Ver reopenQuotaPeriod en quota-cuts.ts. */
export async function markPeriodOpen(id: string): Promise<QuotaPeriodRow | null> {
  const [row] = await db
    .update(quotaPeriods)
    .set({ status: 'open', closedAt: null, updatedAt: new Date() })
    .where(and(eq(quotaPeriods.id, id), eq(quotaPeriods.status, 'closed')))
    .returning()
  return row ? toRow(row) : null
}

export interface QuotaPeriodPatch {
  startsOn?: string
  endsOn?: string
  notes?: string | null
}

/** Editar fechas/notas de un periodo. No re-atribuye ningún lead: las fechas son descriptivas. */
export async function updateQuotaPeriod(id: string, patch: QuotaPeriodPatch): Promise<QuotaPeriodRow> {
  const current = await getQuotaPeriodOrThrow(id)
  const startsOn = patch.startsOn ?? current.startsOn
  const endsOn = patch.endsOn ?? current.endsOn
  if (!ISO_DATE.test(startsOn) || !ISO_DATE.test(endsOn)) {
    throw new QuotaPeriodError('invalid_date_range', 'startsOn and endsOn must be YYYY-MM-DD dates')
  }
  if (endsOn < startsOn) {
    throw new QuotaPeriodError('invalid_date_range', 'endsOn must be on or after startsOn')
  }

  const [row] = await db
    .update(quotaPeriods)
    .set({
      startsOn,
      endsOn,
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(quotaPeriods.id, id))
    .returning()
  return toRow(row)
}
