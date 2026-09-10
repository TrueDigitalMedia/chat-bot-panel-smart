import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, quotaRegionCaps, quotaTargets, surveyProfiles } from '@/lib/db/schema'
import { QUALIFIED_STATUSES } from '@/lib/quotas/quota-progress'
import { canonicalCountry } from '@/lib/geo/cam-nse-catalog'
import {
  isSupportedCountry,
  listNseRegionsForSupportedCountry,
  canonicalNseRegionForSupportedCountry,
} from '@/lib/countries/registry'
import { QuotaTargetError } from '@/lib/quotas/quota-targets'

export interface RegionCapRow {
  id: string
  country: string
  region: string
  capCount: number | null
  notes: string | null
  updatedAt: Date
}

export interface RegionCapProgress {
  cap: number | null
  /** All QUALIFIED_STATUSES leads for this country+region, any quotaMatchedDimension — including 'exception' (spec 011 US3 Q3). */
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

/** Counts every QUALIFIED_STATUSES lead for a country+region, regardless of which dimension (or exception) qualified it. */
async function countRegionAchieved(country: string, region: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(
      and(
        inArray(leads.leadStatus, QUALIFIED_STATUSES),
        eq(surveyProfiles.country, country),
        eq(surveyProfiles.nseRegion, region),
      ),
    )
  return row?.count ?? 0
}

/** Progress for a region's aggregate cap, or null if no cap row is configured (treated as "no cap" — FR-006). */
export async function getRegionCapProgress(country: string, region: string): Promise<RegionCapProgress | null> {
  const [row] = await db
    .select()
    .from(quotaRegionCaps)
    .where(and(eq(quotaRegionCaps.country, country), eq(quotaRegionCaps.region, region)))
    .limit(1)

  if (!row) return null

  const achieved = await countRegionAchieved(country, region)
  return { cap: row.capCount, achieved }
}

/** Sum of the active NSE line targets for a country+region (0 if none configured). */
async function sumActiveNseTargets(country: string, region: string): Promise<number> {
  const [row] = await db
    .select({ sum: sql<number>`coalesce(sum(${quotaTargets.targetCount}), 0)::int` })
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.active, true),
        eq(quotaTargets.dimensionType, 'nse'),
      ),
    )
  return row?.sum ?? 0
}

export interface RegionObjective {
  /** Hard ceiling of qualified leads for this country+region. 0 means the region is closed. */
  objective: number
  /** Where `objective` came from: an explicit manual cap, the derived Σ of NSE lines, or nothing configured. */
  source: 'cap' | 'nse_sum' | 'none'
  /** Every QUALIFIED_STATUSES lead for this country+region, any matched dimension (incl. exception). */
  achieved: number
}

/**
 * The single number that governs recruitment for a country+region (PUNTO 1 clarification,
 * 2026-09-10): the client's requested panelist count for that region is the hard ceiling
 * for EVERYONE — NSE lines, the pregnancy/baby exception, and edad/integrantes alike.
 *
 * Resolution order:
 *  1. An explicit manual `quota_region_caps.cap_count` (the region objective loaded from
 *     the client sample) wins when present.
 *  2. Otherwise the Σ of the region's active NSE line targets (they should add up to the
 *     same number; the admin panel flags mismatches).
 *  3. Otherwise 0 — the region has no configured demand and is CLOSED (nothing qualifies,
 *     not even the exception). This is the deliberate reversal of spec 011's "sin tope"
 *     default, which was letting out-of-sample regions (e.g. Centro I) over-deliver.
 */
export async function getRegionObjective(country: string, region: string): Promise<RegionObjective> {
  if (!country || !region) return { objective: 0, source: 'none', achieved: 0 }

  const [capRow] = await db
    .select({ capCount: quotaRegionCaps.capCount })
    .from(quotaRegionCaps)
    .where(and(eq(quotaRegionCaps.country, country), eq(quotaRegionCaps.region, region)))
    .limit(1)

  const achieved = await countRegionAchieved(country, region)

  if (capRow?.capCount != null) {
    return { objective: capRow.capCount, source: 'cap', achieved }
  }

  const nseSum = await sumActiveNseTargets(country, region)
  if (nseSum > 0) {
    return { objective: nseSum, source: 'nse_sum', achieved }
  }

  return { objective: 0, source: 'none', achieved }
}

export async function listRegionCaps(): Promise<(RegionCapRow & { achieved: number })[]> {
  const rows = await db.select().from(quotaRegionCaps)
  return Promise.all(
    rows.map(async (row) => ({ ...row, achieved: await countRegionAchieved(row.country, row.region) })),
  )
}

export interface RegionObjectiveRow {
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
  nseSum: number
  capCount: number | null
}

/**
 * Objective + progress for every country+region that has any active NSE line or a manual
 * cap configured. Powers the "estado de cuota por región" table in /admin/quotas.
 */
export async function listRegionObjectives(): Promise<RegionObjectiveRow[]> {
  const capRows = await db.select().from(quotaRegionCaps)
  const nseRows = await db
    .select({
      country: quotaTargets.country,
      region: quotaTargets.region,
      sum: sql<number>`coalesce(sum(${quotaTargets.targetCount}), 0)::int`,
    })
    .from(quotaTargets)
    .where(and(eq(quotaTargets.active, true), eq(quotaTargets.dimensionType, 'nse')))
    .groupBy(quotaTargets.country, quotaTargets.region)

  const nseSumByKey = new Map(nseRows.map((r) => [`${r.country}|${r.region}`, r.sum ?? 0]))
  const capByKey = new Map(capRows.map((r) => [`${r.country}|${r.region}`, r.capCount]))
  const keys = new Set<string>([...nseSumByKey.keys(), ...capByKey.keys()])

  return Promise.all(
    [...keys].map(async (k) => {
      const [country, region] = k.split('|')
      const nseSum = nseSumByKey.get(k) ?? 0
      const capCount = capByKey.get(k) ?? null
      const objective = capCount != null ? capCount : nseSum
      const source: RegionObjectiveRow['source'] =
        capCount != null ? 'cap' : nseSum > 0 ? 'nse_sum' : 'none'
      const achieved = await countRegionAchieved(country, region)
      return {
        country,
        region,
        objective,
        source,
        achieved,
        available: Math.max(0, objective - achieved),
        complete: objective > 0 && achieved >= objective,
        mismatch: capCount != null && nseSum > 0 && capCount !== nseSum,
        nseSum,
        capCount,
      }
    }),
  ).then((rows) => rows.sort((a, b) => a.country.localeCompare(b.country) || a.region.localeCompare(b.region)))
}

export interface RegionCapInput {
  country: string
  region: string
  capCount?: number | null
  notes?: string | null
}

export class RegionCapConflictError extends Error {}
export class RegionCapNotFoundError extends Error {}

export async function createRegionCap(input: RegionCapInput) {
  const { country, region } = validateCountryRegion(input.country, input.region)

  if (input.capCount != null && input.capCount < 0) {
    throw new QuotaTargetError('invalid_target_count', 'capCount must be >= 0')
  }

  const [existing] = await db
    .select({ id: quotaRegionCaps.id })
    .from(quotaRegionCaps)
    .where(and(eq(quotaRegionCaps.country, country), eq(quotaRegionCaps.region, region)))
    .limit(1)
  if (existing) {
    throw new RegionCapConflictError(`Region cap already exists for ${country} / ${region} — use PUT to edit it`)
  }

  const [row] = await db
    .insert(quotaRegionCaps)
    .values({ country, region, capCount: input.capCount ?? null, notes: input.notes ?? null })
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
