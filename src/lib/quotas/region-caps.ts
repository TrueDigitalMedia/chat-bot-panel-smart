import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, quotaRegionCaps, quotaTargets, surveyProfiles } from '@/lib/db/schema'
import { QUALIFIED_STATUSES, resolvePeriodIds } from '@/lib/quotas/quota-progress'
import { canonicalCountry } from '@/lib/geo/cam-nse-catalog'
import {
  isSupportedCountry,
  listNseRegionsForSupportedCountry,
  canonicalNseRegionForSupportedCountry,
} from '@/lib/countries/registry'
import { QuotaTargetError, assertPeriodWritable } from '@/lib/quotas/quota-targets'

export interface RegionCapRow {
  id: string
  periodId: string
  country: string
  region: string
  capCount: number | null
  notes: string | null
  updatedAt: Date
}

export interface RegionCapProgress {
  cap: number | null
  /** All QUALIFIED_STATUSES leads for this period+country+region, any quotaMatchedDimension —
   *  including 'exception' (spec 011 US3 Q3). */
  achieved: number
}

function validateCountryRegion(country: string, region: string): { country: string; region: string } {
  const canonicalCountryName = canonicalCountry(country) ?? country
  if (!isSupportedCountry(canonicalCountryName)) {
    throw new QuotaTargetError('invalid_country', `Unrecognized country: ${country}`)
  }
  const canonicalRegion = canonicalNseRegionForSupportedCountry(canonicalCountryName, region)
  if (!canonicalRegion) {
    throw new QuotaTargetError('invalid_region', `Region "${region}" is not valid for ${canonicalCountryName}`, {
      validRegions: [...listNseRegionsForSupportedCountry(canonicalCountryName)],
    })
  }
  return { country: canonicalCountryName, region: canonicalRegion }
}

function regionKey(periodId: string, country: string, region: string): string {
  return `${periodId}|${country}|${region}`
}

/**
 * Every QUALIFIED_STATUSES lead per (period, country, region) in ONE grouped query, regardless
 * of which dimension (or the exception) qualified it.
 *
 * Replaces the `Promise.all(rows.map(countRegionAchieved))` that listRegionObjectives and
 * listRegionCaps used to do — the exact N-concurrent-queries pattern that already blew Neon's
 * connection limit for quota cells (see countAchievedMap's comment); periods would have
 * multiplied it by the number of periods on screen.
 */
async function countRegionAchievedMap(periodIds: string[]): Promise<Map<string, number>> {
  if (periodIds.length === 0) return new Map()

  const rows = await db
    .select({
      periodId: leads.quotaPeriodId,
      country: surveyProfiles.country,
      region: surveyProfiles.nseRegion,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(and(inArray(leads.leadStatus, QUALIFIED_STATUSES), inArray(leads.quotaPeriodId, periodIds)))
    .groupBy(leads.quotaPeriodId, surveyProfiles.country, surveyProfiles.nseRegion)

  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.periodId || !r.country || !r.region) continue
    map.set(regionKey(r.periodId, r.country, r.region), r.count)
  }
  return map
}

/** Counts every QUALIFIED_STATUSES lead of one period+country+region, any matched dimension. */
async function countRegionAchieved(periodId: string, country: string, region: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(
      and(
        inArray(leads.leadStatus, QUALIFIED_STATUSES),
        eq(leads.quotaPeriodId, periodId),
        eq(surveyProfiles.country, country),
        eq(surveyProfiles.nseRegion, region),
      ),
    )
  return row?.count ?? 0
}

/** Progress for a region's aggregate cap in one period, or null if no cap row is configured. */
export async function getRegionCapProgress(
  periodId: string,
  country: string,
  region: string,
): Promise<RegionCapProgress | null> {
  const [row] = await db
    .select()
    .from(quotaRegionCaps)
    .where(
      and(
        eq(quotaRegionCaps.periodId, periodId),
        eq(quotaRegionCaps.country, country),
        eq(quotaRegionCaps.region, region),
      ),
    )
    .limit(1)

  if (!row) return null

  const achieved = await countRegionAchieved(periodId, country, region)
  return { cap: row.capCount, achieved }
}

interface NseLineStats {
  /** NSE line rows configured for the region in this period, active or not. */
  lineCount: number
  /** How many of those rows are active. 0 with `lineCount > 0` means the region was deactivated. */
  activeLineCount: number
  /** Sum of the ACTIVE NSE line targets (0 if none active). */
  activeSum: number
}

/** NSE line rows for a period+country+region, split by active/inactive — see getRegionObjective. */
async function getNseLineStats(periodId: string, country: string, region: string): Promise<NseLineStats> {
  const [row] = await db
    .select({
      lineCount: sql<number>`count(*)::int`,
      activeLineCount: sql<number>`count(*) filter (where ${quotaTargets.active})::int`,
      activeSum: sql<number>`coalesce(sum(${quotaTargets.targetCount}) filter (where ${quotaTargets.active}), 0)::int`,
    })
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.periodId, periodId),
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.dimensionType, 'nse'),
      ),
    )
  return {
    lineCount: row?.lineCount ?? 0,
    activeLineCount: row?.activeLineCount ?? 0,
    activeSum: row?.activeSum ?? 0,
  }
}

export interface RegionObjective {
  /** Hard ceiling of qualified leads for this period+country+region. 0 means the region is closed. */
  objective: number
  /** Where `objective` came from: an explicit manual cap, the derived Σ of NSE lines, or nothing configured. */
  source: 'cap' | 'nse_sum' | 'none'
  /** Every QUALIFIED_STATUSES lead of this period+country+region, any matched dimension (incl. exception). */
  achieved: number
  /** Every NSE line row of the region is inactive: the region was deactivated in the admin panel. */
  deactivated: boolean
}

/**
 * The single number that governs recruitment for a country+region WITHIN ONE PERIOD (PUNTO 1
 * clarification, 2026-09-10): the client's requested panelist count for that region is the hard
 * ceiling for EVERYONE — NSE lines, the pregnancy/baby exception, and edad/integrantes alike.
 *
 * The period gate itself is evaluated EARLIER, by checkRegionQuota: a country with no open
 * period never reaches this function at all.
 *
 * Resolution order:
 *  0. A DEACTIVATED region — it has NSE line rows in this period but every one of them is
 *     `active = false`, which is how the admin panel closes a region — is CLOSED, objective 0,
 *     even if a manual cap row from the original client sample is still sitting there.
 *     Deactivating the lines is the explicit, later operator decision; the cap row is the stale
 *     one. Without this, a deactivated region kept `source: 'cap'` and stayed "open", which let
 *     the pregnancy/baby-under-3 exception in scoring/quota.ts keep qualifying leads into
 *     regions the operator had already closed (bug 2026-09-23: Rep. Dominicana Santiago
 *     and Sureste, every one of those leads matched as 'exception').
 *  1. An explicit manual `quota_region_caps.cap_count` (the region objective loaded from
 *     the client sample) wins when present.
 *  2. Otherwise the Σ of the region's active NSE line targets (they should add up to the
 *     same number; the admin panel flags mismatches).
 *  3. Otherwise 0 — the region has no configured demand and is CLOSED (nothing qualifies,
 *     not even the exception). This is the deliberate reversal of spec 011's "sin tope"
 *     default, which was letting out-of-sample regions (e.g. Centro I) over-deliver. It is
 *     ALSO what makes a freshly opened, still-empty period close every region of its country —
 *     intended semantics, not a bug (spec 018: a new Q starts empty by design).
 */
export async function getRegionObjective(
  periodId: string,
  country: string,
  region: string,
): Promise<RegionObjective> {
  if (!periodId || !country || !region) {
    return { objective: 0, source: 'none', achieved: 0, deactivated: false }
  }

  const [capRow] = await db
    .select({ capCount: quotaRegionCaps.capCount })
    .from(quotaRegionCaps)
    .where(
      and(
        eq(quotaRegionCaps.periodId, periodId),
        eq(quotaRegionCaps.country, country),
        eq(quotaRegionCaps.region, region),
      ),
    )
    .limit(1)

  const achieved = await countRegionAchieved(periodId, country, region)
  const nse = await getNseLineStats(periodId, country, region)
  const deactivated = nse.lineCount > 0 && nse.activeLineCount === 0
  const base = { achieved, deactivated }

  if (deactivated) {
    return { objective: 0, source: 'none', ...base }
  }

  if (capRow?.capCount != null) {
    return { objective: capRow.capCount, source: 'cap', ...base }
  }

  if (nse.activeSum > 0) {
    return { objective: nse.activeSum, source: 'nse_sum', ...base }
  }

  return { objective: 0, source: 'none', ...base }
}

export interface RegionCapListFilters {
  periodId?: string
  periodIds?: string[]
  country?: string
}

export async function listRegionCaps(
  filters: RegionCapListFilters = {},
): Promise<(RegionCapRow & { achieved: number })[]> {
  const periodIds = await resolvePeriodIds(filters)
  if (periodIds.length === 0) return []

  const conditions: SQL[] = [inArray(quotaRegionCaps.periodId, periodIds)]
  if (filters.country) conditions.push(eq(quotaRegionCaps.country, filters.country))

  const rows = await db.select().from(quotaRegionCaps).where(and(...conditions))
  const achievedMap = await countRegionAchievedMap(periodIds)

  return rows.map((row) => ({
    ...row,
    achieved: achievedMap.get(regionKey(row.periodId, row.country, row.region)) ?? 0,
  }))
}

export interface RegionObjectiveRow {
  periodId: string
  country: string
  region: string
  objective: number
  source: 'cap' | 'nse_sum' | 'none'
  achieved: number
  available: number
  /** Region is at/over its objective — the bot now sends new leads here to "cuota agotada". */
  complete: boolean
  /** A manual cap is set AND the Σ of NSE lines disagrees with it — worth the admin's attention. */
  mismatch: boolean
  /** Every NSE line of the region is inactive — the region is closed regardless of `capCount`. */
  deactivated: boolean
  nseSum: number
  capCount: number | null
}

/**
 * Objective + progress for every period+country+region that has any NSE line or a manual cap
 * configured. Powers the "estado de cuota por región" table in /admin/quotas and the corte
 * snapshot in quota-cuts.ts.
 *
 * With no filters this covers every OPEN period — see resolvePeriodIds.
 */
export async function listRegionObjectives(
  filters: RegionCapListFilters = {},
): Promise<RegionObjectiveRow[]> {
  const periodIds = await resolvePeriodIds(filters)
  if (periodIds.length === 0) return []

  const capConditions: SQL[] = [inArray(quotaRegionCaps.periodId, periodIds)]
  const nseConditions: SQL[] = [
    inArray(quotaTargets.periodId, periodIds),
    eq(quotaTargets.dimensionType, 'nse'),
  ]
  if (filters.country) {
    capConditions.push(eq(quotaRegionCaps.country, filters.country))
    nseConditions.push(eq(quotaTargets.country, filters.country))
  }

  const capRows = await db.select().from(quotaRegionCaps).where(and(...capConditions))
  // Every NSE line row, active or not — a region whose rows are ALL inactive is deactivated
  // and must show as closed here too, the same way getRegionObjective now decides it.
  const nseRows = await db
    .select({
      periodId: quotaTargets.periodId,
      country: quotaTargets.country,
      region: quotaTargets.region,
      lineCount: sql<number>`count(*)::int`,
      activeLineCount: sql<number>`count(*) filter (where ${quotaTargets.active})::int`,
      activeSum: sql<number>`coalesce(sum(${quotaTargets.targetCount}) filter (where ${quotaTargets.active}), 0)::int`,
    })
    .from(quotaTargets)
    .where(and(...nseConditions))
    .groupBy(quotaTargets.periodId, quotaTargets.country, quotaTargets.region)

  const nseByKey = new Map(nseRows.map((r) => [regionKey(r.periodId, r.country, r.region), r]))
  const capByKey = new Map(capRows.map((r) => [regionKey(r.periodId, r.country, r.region), r.capCount]))
  const achievedMap = await countRegionAchievedMap(periodIds)
  const keys = new Set<string>([...nseByKey.keys(), ...capByKey.keys()])

  return [...keys]
    .map((k) => {
      const [periodId, country, region] = k.split('|')
      const nse = nseByKey.get(k)
      const nseSum = nse?.activeSum ?? 0
      const deactivated = (nse?.lineCount ?? 0) > 0 && (nse?.activeLineCount ?? 0) === 0
      const capCount = capByKey.get(k) ?? null
      const objective = deactivated ? 0 : capCount != null ? capCount : nseSum
      const source: RegionObjectiveRow['source'] = deactivated
        ? 'none'
        : capCount != null
          ? 'cap'
          : nseSum > 0
            ? 'nse_sum'
            : 'none'
      const achieved = achievedMap.get(k) ?? 0
      return {
        periodId,
        country,
        region,
        objective,
        source,
        achieved,
        available: Math.max(0, objective - achieved),
        // A deactivated region is closed, not "complete" — `objective > 0` already excludes it.
        complete: objective > 0 && achieved >= objective,
        mismatch: !deactivated && capCount != null && nseSum > 0 && capCount !== nseSum,
        deactivated,
        nseSum,
        capCount,
      }
    })
    .sort((a, b) => a.country.localeCompare(b.country) || a.region.localeCompare(b.region))
}

export interface RegionCapInput {
  periodId: string
  country: string
  region: string
  capCount?: number | null
  notes?: string | null
}

export class RegionCapConflictError extends Error {}
export class RegionCapNotFoundError extends Error {}

export async function createRegionCap(input: RegionCapInput) {
  const { country, region } = validateCountryRegion(input.country, input.region)
  // Nunca escribir configuración en un periodo cerrado (ni en uno de otro país).
  await assertPeriodWritable(input.periodId, country)

  if (input.capCount != null && input.capCount < 0) {
    throw new QuotaTargetError('invalid_target_count', 'capCount must be >= 0')
  }

  const [existing] = await db
    .select({ id: quotaRegionCaps.id })
    .from(quotaRegionCaps)
    .where(
      and(
        eq(quotaRegionCaps.periodId, input.periodId),
        eq(quotaRegionCaps.country, country),
        eq(quotaRegionCaps.region, region),
      ),
    )
    .limit(1)
  if (existing) {
    throw new RegionCapConflictError(
      `Region cap already exists for ${country} / ${region} in this period — use PUT to edit it`,
    )
  }

  const [row] = await db
    .insert(quotaRegionCaps)
    .values({
      periodId: input.periodId,
      country,
      region,
      capCount: input.capCount ?? null,
      notes: input.notes ?? null,
    })
    .returning()
  return row
}

export interface RegionCapPatch {
  capCount?: number | null
  notes?: string | null
}

export async function updateRegionCap(id: string, patch: RegionCapPatch) {
  if (patch.capCount != null && patch.capCount < 0) {
    throw new QuotaTargetError('invalid_target_count', 'capCount must be >= 0')
  }

  const [current] = await db
    .select({ periodId: quotaRegionCaps.periodId, country: quotaRegionCaps.country })
    .from(quotaRegionCaps)
    .where(eq(quotaRegionCaps.id, id))
    .limit(1)
  if (!current) {
    throw new RegionCapNotFoundError(`Region cap not found: ${id}`)
  }
  await assertPeriodWritable(current.periodId, current.country)

  const [row] = await db
    .update(quotaRegionCaps)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(quotaRegionCaps.id, id))
    .returning()

  if (!row) {
    throw new RegionCapNotFoundError(`Region cap not found: ${id}`)
  }
  return row
}
