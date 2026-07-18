import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaTargets, leads, surveyProfiles } from '@/lib/db/schema'
import type { LeadStatus } from '@/types/lead'

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
  nseLevel: string
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
  nseLevel: string
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
    nseLevel: row.nseLevel,
    target: row.targetCount,
    achieved,
    available,
    active: row.active,
    notes: row.notes,
    progressPct,
    updatedAt: row.updatedAt,
  }
}

async function countAchieved(country: string, region: string, nseLevel: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(
      and(
        inArray(leads.leadStatus, QUALIFIED_STATUSES),
        eq(leads.quotaSegment, nseLevel),
        eq(surveyProfiles.country, country),
        eq(surveyProfiles.nseRegion, region),
      ),
    )
  return row?.count ?? 0
}

/** Progress for a single country+region+nseLevel combination, or null if no target row exists. */
export async function getQuotaProgressForTarget(
  country: string,
  region: string,
  nseLevel: string,
): Promise<QuotaProgress | null> {
  const [row] = await db
    .select()
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.nseLevel, nseLevel),
      ),
    )
    .limit(1)

  if (!row) return null

  const achieved = await countAchieved(country, region, nseLevel)
  return toProgress(row, achieved)
}

export interface QuotaProgressFilters {
  country?: string
  region?: string
  nseLevel?: string
  active?: boolean
}

/** Progress for all quota targets matching the given filters. */
export async function listQuotaProgress(filters: QuotaProgressFilters = {}): Promise<QuotaProgress[]> {
  const conditions: SQL[] = []
  if (filters.country) conditions.push(eq(quotaTargets.country, filters.country))
  if (filters.region) conditions.push(eq(quotaTargets.region, filters.region))
  if (filters.nseLevel) conditions.push(eq(quotaTargets.nseLevel, filters.nseLevel))
  if (filters.active !== undefined) conditions.push(eq(quotaTargets.active, filters.active))

  const rows = await db
    .select()
    .from(quotaTargets)
    .where(conditions.length ? and(...conditions) : undefined)

  return Promise.all(
    rows.map(async (row) => toProgress(row, await countAchieved(row.country, row.region, row.nseLevel))),
  )
}
