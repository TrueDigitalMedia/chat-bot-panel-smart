import { and, eq, gte, inArray, isNotNull, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles } from '@/lib/db/schema'
import { QUALIFIED_STATUSES } from '@/lib/quotas/quota-progress'
import type { Channel } from '@/types/channel'

export type FunnelStageKey =
  | 'started'
  | 'passed_d1'
  | 'passed_d3'
  | 'survey_completed'
  | 'qualified'
  | 'registered'
  | 'ficha_hogar_completada'

export interface FunnelStage {
  key: FunnelStageKey
  label: string
  count: number
  /** % vs. the previous stage's count. Always 0 for the first stage (data-model.md). */
  pctOfPrevious: number
  /** % vs. the first stage's count. */
  pctOfTotal: number
}

export interface ConversionFunnel {
  stages: FunnelStage[]
  biggestDropStageKey: FunnelStageKey | null
}

export interface FunnelFilters {
  country?: string
  channel?: Channel
  dateFrom?: Date
  dateTo?: Date
  // Deliberately no region/nseLevel — research.md R4 (assigned upstream of NSE/region).
}

/**
 * Total qualified leads (any dimension — nse/edad/integrantes — or the pregnancy/baby
 * exception), for the dashboard's top-level "Conseguidos" card. Unlike
 * listQuotaProgress's per-cell `achieved` (scoped to a single dimension type so a
 * region's target isn't triple-counted across its OR-matched dimensions), this counts
 * every lead that actually qualified, matching the funnel's own "qualified" stage.
 */
export async function countQualifiedLeadsTotal(filters: FunnelFilters): Promise<number> {
  return countLeads(filters, [inArray(leads.leadStatus, QUALIFIED_STATUSES)])
}

/** Same as countQualifiedLeadsTotal, grouped by country — for the per-country chart. */
export async function countQualifiedLeadsByCountry(
  filters: Omit<FunnelFilters, 'country'> & { country?: string },
): Promise<Map<string, number>> {
  const conditions: SQL[] = [inArray(leads.leadStatus, QUALIFIED_STATUSES)]
  if (filters.channel) conditions.push(eq(leads.channel, filters.channel))
  if (filters.dateFrom) conditions.push(gte(leads.createdAt, filters.dateFrom))
  if (filters.dateTo) conditions.push(lte(leads.createdAt, filters.dateTo))
  if (filters.country) conditions.push(eq(surveyProfiles.country, filters.country))

  const rows = await db
    .select({ country: surveyProfiles.country, count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(and(...conditions))
    .groupBy(surveyProfiles.country)

  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.country) map.set(row.country, row.count)
  }
  return map
}

async function countLeads(filters: FunnelFilters, extra: SQL[]): Promise<number> {
  const conditions: SQL[] = [...extra]
  if (filters.channel) conditions.push(eq(leads.channel, filters.channel))
  if (filters.dateFrom) conditions.push(gte(leads.createdAt, filters.dateFrom))
  if (filters.dateTo) conditions.push(lte(leads.createdAt, filters.dateTo))
  if (filters.country) conditions.push(eq(surveyProfiles.country, filters.country))

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(conditions.length ? and(...conditions) : undefined)
  return row?.count ?? 0
}

const REGISTERED_STATUSES = ['code_delivered_registered', 'ficha_hogar_completada'] as const

export async function getConversionFunnel(filters: FunnelFilters = {}): Promise<ConversionFunnel> {
  const counts: Array<{ key: FunnelStageKey; label: string; count: number }> = [
    { key: 'started', label: 'Iniciaron conversación', count: await countLeads(filters, []) },
    {
      key: 'passed_d1',
      label: 'Pasaron D1 (T&C)',
      count: await countLeads(filters, [eq(leads.d1Accepted, true)]),
    },
    {
      key: 'passed_d3',
      label: 'Pasaron D3 (es comprador)',
      count: await countLeads(filters, [eq(leads.d3IsShopper, true)]),
    },
    {
      key: 'survey_completed',
      label: 'Completaron encuesta',
      count: await countLeads(filters, [isNotNull(surveyProfiles.completedAt)]),
    },
    {
      key: 'qualified',
      label: 'Calificaron por NSE + cupo',
      count: await countLeads(filters, [inArray(leads.leadStatus, QUALIFIED_STATUSES)]),
    },
    {
      key: 'registered',
      label: 'Registrados en app',
      count: await countLeads(filters, [inArray(leads.leadStatus, REGISTERED_STATUSES)]),
    },
    {
      key: 'ficha_hogar_completada',
      label: 'Ficha Hogar completada',
      count: await countLeads(filters, [eq(leads.leadStatus, 'ficha_hogar_completada')]),
    },
  ]

  const total = counts[0]?.count ?? 0
  let biggestDropStageKey: FunnelStageKey | null = null
  let biggestDropPct = -1

  const stages: FunnelStage[] = counts.map((stage, i) => {
    const previous = i === 0 ? null : counts[i - 1].count
    const pctOfPrevious = i === 0 ? 0 : previous! > 0 ? Math.round((stage.count / previous!) * 100) : 0
    const pctOfTotal = total > 0 ? Math.round((stage.count / total) * 100) : 0

    if (i > 0) {
      const dropPct = 100 - pctOfPrevious
      if (dropPct > biggestDropPct) {
        biggestDropPct = dropPct
        biggestDropStageKey = stage.key
      }
    }

    return { ...stage, pctOfPrevious, pctOfTotal }
  })

  return { stages, biggestDropStageKey }
}
