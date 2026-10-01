import { and, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaTargets, leads, surveyProfiles } from '@/lib/db/schema'
import type { LeadStatus } from '@/types/lead'
import type { Channel } from '@/types/channel'
import type { DimensionType } from './quota-targets'
import { listOpenPeriodIds } from './quota-periods'

/** Lead statuses reached only after passing the quota check (see docs/WIKI.md §3 state machine). */
export const QUALIFIED_STATUSES: LeadStatus[] = [
  'link_sent',
  'waiting_for_code',
  'code_delivered_registered',
  'code_delivered_not_registered',
  'code_delivered_no_response',
  'ficha_hogar_completada',
]

export interface QuotaProgress {
  id: string
  /** El periodo (Q) al que pertenece esta línea — spec 018. */
  periodId: string
  country: string
  region: string
  dimensionType: string
  dimensionValue: string
  target: number
  achieved: number
  available: number
  active: boolean
  notes: string | null
  progressPct: number
  updatedAt: Date
}

export interface QuotaTargetRow {
  id: string
  periodId: string
  country: string
  region: string
  dimensionType: string
  dimensionValue: string
  targetCount: number
  active: boolean
  notes: string | null
  updatedAt: Date
}

/** Exported for unit testing the target/achieved/available math without a DB. */
export function toProgress(row: QuotaTargetRow, achieved: number): QuotaProgress {
  const available = Math.max(0, row.targetCount - achieved)
  const progressPct =
    row.targetCount > 0 ? Math.min(100, Math.round((achieved / row.targetCount) * 100)) : 0
  return {
    id: row.id,
    periodId: row.periodId,
    country: row.country,
    region: row.region,
    dimensionType: row.dimensionType,
    dimensionValue: row.dimensionValue,
    target: row.targetCount,
    achieved,
    available,
    active: row.active,
    notes: row.notes,
    progressPct,
    updatedAt: row.updatedAt,
  }
}

interface AchievedFilters {
  channel?: Channel
  dateFrom?: Date
  dateTo?: Date
}

function achievedKey(
  periodId: string,
  country: string,
  region: string,
  dimensionType: string,
  dimensionValue: string,
): string {
  return `${periodId} ${country} ${region} ${dimensionType} ${dimensionValue}`
}

/**
 * Achieved counts for every (periodId, country, region, dimensionType, dimensionValue) cell in
 * ONE grouped query, keyed by achievedKey(). Firing one countAchieved() per quota-target row
 * (as listQuotaProgress used to, via Promise.all) sent that many concurrent HTTP requests
 * through Neon's driver and blew past its connection limit ("Too many connections
 * attempts") once there were more than a handful of target rows.
 *
 * Takes an ARRAY of period ids, not one: /admin/quotas lists several countries at once, i.e.
 * several open periods. Looping this function per period would re-open that same bug.
 */
async function countAchievedMap(periodIds: string[], extra: AchievedFilters = {}): Promise<Map<string, number>> {
  if (periodIds.length === 0) return new Map()

  const conditions: SQL[] = [
    inArray(leads.leadStatus, QUALIFIED_STATUSES),
    inArray(leads.quotaPeriodId, periodIds),
  ]
  if (extra.channel) conditions.push(eq(leads.channel, extra.channel))
  if (extra.dateFrom) conditions.push(gte(leads.createdAt, extra.dateFrom))
  if (extra.dateTo) conditions.push(lte(leads.createdAt, extra.dateTo))

  const rows = await db
    .select({
      periodId: leads.quotaPeriodId,
      country: surveyProfiles.country,
      region: surveyProfiles.nseRegion,
      dimensionType: leads.quotaMatchedDimension,
      dimensionValue: leads.quotaMatchedValue,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(and(...conditions))
    .groupBy(
      leads.quotaPeriodId,
      surveyProfiles.country,
      surveyProfiles.nseRegion,
      leads.quotaMatchedDimension,
      leads.quotaMatchedValue,
    )

  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.periodId || !r.country || !r.region || !r.dimensionType || !r.dimensionValue) continue
    map.set(achievedKey(r.periodId, r.country, r.region, r.dimensionType, r.dimensionValue), r.count)
  }
  return map
}

/**
 * Counts leads attributed to this exact dimension cell OF THIS PERIOD — i.e. leads whose
 * `quota_period_id` is this period and whose `quota_matched_dimension`/`quota_matched_value`
 * equal this cell, not merely leads that also happen to have this NSE/edad/integrantes value
 * (see research.md R4 — a lead only decrements the one dimension that qualified it, not every
 * dimension it satisfies).
 *
 * Scoped by the `quota_period_id` STAMP, never by a date window on created_at: the stamp is
 * written at the moment the lead passed the quota check, so it knows which quota it actually
 * consumed, and editing a period's (purely descriptive) dates can never silently re-attribute
 * leads out of an already-closed corte.
 */
async function countAchieved(
  periodId: string,
  country: string,
  region: string,
  dimensionType: string,
  dimensionValue: string,
  extra: AchievedFilters = {},
): Promise<number> {
  const conditions: SQL[] = [
    inArray(leads.leadStatus, QUALIFIED_STATUSES),
    eq(leads.quotaPeriodId, periodId),
    eq(leads.quotaMatchedDimension, dimensionType),
    eq(leads.quotaMatchedValue, dimensionValue),
    eq(surveyProfiles.country, country),
    eq(surveyProfiles.nseRegion, region),
  ]
  if (extra.channel) conditions.push(eq(leads.channel, extra.channel))
  if (extra.dateFrom) conditions.push(gte(leads.createdAt, extra.dateFrom))
  if (extra.dateTo) conditions.push(lte(leads.createdAt, extra.dateTo))

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(and(...conditions))
  return row?.count ?? 0
}

/**
 * The active **NSE** quota line of THIS PERIOD with the highest configured target_count that
 * still has room (available > 0). Used to charge a conditional-qualified lead (pregnancy/baby or
 * edad/integrantes) to an NSE line WITHOUT pushing any line over its own objective —
 * every period+region+NSE line is a hard cap that must deactivate on time (PUNTO 1
 * clarification 2026-09-10: El Salvador Centro II / Nivel 4 went 14 → 20). Null when
 * every NSE line in the region is already full — the lead then does not qualify.
 */
export async function getHighestVolumeNseTargetWithRoom(
  periodId: string,
  country: string,
  region: string,
): Promise<{ dimensionType: DimensionType; dimensionValue: string } | null> {
  const rows = await db
    .select()
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.periodId, periodId),
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.active, true),
        eq(quotaTargets.dimensionType, 'nse'),
      ),
    )
    .orderBy(desc(quotaTargets.targetCount))

  for (const row of rows) {
    const achieved = await countAchieved(periodId, row.country, row.region, 'nse', row.dimensionValue)
    if (row.targetCount - achieved > 0) {
      return { dimensionType: 'nse', dimensionValue: row.dimensionValue }
    }
  }
  return null
}

/** Progress for a single period+country+region+dimension combination, or null if no target row exists. */
export async function getQuotaProgressForTarget(
  periodId: string,
  country: string,
  region: string,
  dimensionType: string,
  dimensionValue: string,
): Promise<QuotaProgress | null> {
  const [row] = await db
    .select()
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.periodId, periodId),
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.dimensionType, dimensionType),
        eq(quotaTargets.dimensionValue, dimensionValue),
      ),
    )
    .limit(1)

  if (!row) return null

  const achieved = await countAchieved(periodId, country, region, dimensionType, dimensionValue)
  return toProgress(row, achieved)
}

export interface QuotaProgressFilters {
  /** One period. Mutually exclusive with `periodIds`; both absent ⇒ every OPEN period. */
  periodId?: string
  periodIds?: string[]
  country?: string
  region?: string
  dimensionType?: string
  dimensionValue?: string
  active?: boolean
  /** Dashboard-only filters (spec 006) — narrow the "achieved" count, not which target rows are
   *  listed. They INTERSECT with the period scope; they never replace it. */
  channel?: Channel
  dateFrom?: Date
  dateTo?: Date
}

/**
 * Resolves which periods a read covers. With neither `periodId` nor `periodIds`, the answer is
 * every OPEN period — NOT every period ever recorded, which would sum Q1+Q2+Q3+Q4 into the
 * summary cards and read 400%.
 */
export async function resolvePeriodIds(filters: {
  periodId?: string
  periodIds?: string[]
  country?: string
}): Promise<string[]> {
  if (filters.periodIds) return filters.periodIds
  if (filters.periodId) return [filters.periodId]
  return listOpenPeriodIds(filters.country)
}

/** Progress for all quota targets matching the given filters. */
export async function listQuotaProgress(filters: QuotaProgressFilters = {}): Promise<QuotaProgress[]> {
  const periodIds = await resolvePeriodIds(filters)
  if (periodIds.length === 0) return []

  const conditions: SQL[] = [inArray(quotaTargets.periodId, periodIds)]
  if (filters.country) conditions.push(eq(quotaTargets.country, filters.country))
  if (filters.region) conditions.push(eq(quotaTargets.region, filters.region))
  if (filters.dimensionType) conditions.push(eq(quotaTargets.dimensionType, filters.dimensionType))
  if (filters.dimensionValue) conditions.push(eq(quotaTargets.dimensionValue, filters.dimensionValue))
  if (filters.active !== undefined) conditions.push(eq(quotaTargets.active, filters.active))

  const rows = await db.select().from(quotaTargets).where(and(...conditions))

  const achievedMap = await countAchievedMap(periodIds, {
    channel: filters.channel,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })

  return rows.map((row) =>
    toProgress(
      row,
      achievedMap.get(
        achievedKey(row.periodId, row.country, row.region, row.dimensionType, row.dimensionValue),
      ) ?? 0,
    ),
  )
}
