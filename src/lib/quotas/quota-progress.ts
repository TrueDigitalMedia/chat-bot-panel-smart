import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaTargets, leads, surveyProfiles } from '@/lib/db/schema'
import type { LeadStatus } from '@/types/lead'
import type { Channel } from '@/types/channel'

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

/**
 * Counts leads attributed to this exact dimension cell — i.e. leads whose
 * `quota_matched_dimension`/`quota_matched_value` equal this cell, not merely leads that
 * also happen to have this NSE/edad/integrantes value (see research.md R4 — a lead only
 * decrements the one dimension that qualified it, not every dimension it satisfies).
 */
async function countAchieved(
  country: string,
  region: string,
  dimensionType: string,
  dimensionValue: string,
  extra: AchievedFilters = {},
): Promise<number> {
  const conditions: SQL[] = [
    inArray(leads.leadStatus, QUALIFIED_STATUSES),
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

/** Progress for a single country+region+dimension combination, or null if no target row exists. */
export async function getQuotaProgressForTarget(
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
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.dimensionType, dimensionType),
        eq(quotaTargets.dimensionValue, dimensionValue),
      ),
    )
    .limit(1)

  if (!row) return null

  const achieved = await countAchieved(country, region, dimensionType, dimensionValue)
  return toProgress(row, achieved)
}

export interface QuotaProgressFilters {
  country?: string
  region?: string
  dimensionType?: string
  dimensionValue?: string
  active?: boolean
  /** Dashboard-only filters (spec 006) — narrow the "achieved" count, not which target rows are listed. */
  channel?: Channel
  dateFrom?: Date
  dateTo?: Date
}

/** Progress for all quota targets matching the given filters. */
export async function listQuotaProgress(filters: QuotaProgressFilters = {}): Promise<QuotaProgress[]> {
  const conditions: SQL[] = []
  if (filters.country) conditions.push(eq(quotaTargets.country, filters.country))
  if (filters.region) conditions.push(eq(quotaTargets.region, filters.region))
  if (filters.dimensionType) conditions.push(eq(quotaTargets.dimensionType, filters.dimensionType))
  if (filters.dimensionValue) conditions.push(eq(quotaTargets.dimensionValue, filters.dimensionValue))
  if (filters.active !== undefined) conditions.push(eq(quotaTargets.active, filters.active))

  const rows = await db
    .select()
    .from(quotaTargets)
    .where(conditions.length ? and(...conditions) : undefined)

  const achievedFilters: AchievedFilters = {
    channel: filters.channel,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }

  return Promise.all(
    rows.map(async (row) =>
      toProgress(
        row,
        await countAchieved(row.country, row.region, row.dimensionType, row.dimensionValue, achievedFilters),
      ),
    ),
  )
}
