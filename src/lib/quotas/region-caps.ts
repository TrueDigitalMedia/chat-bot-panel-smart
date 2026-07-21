import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, quotaRegionCaps, surveyProfiles } from '@/lib/db/schema'
import { QUALIFIED_STATUSES } from '@/lib/quotas/quota-progress'
import { canonicalCountry, canonicalNseRegion, listCatalogCountries, listNseRegionsForCountry } from '@/lib/geo/cam-nse-catalog'
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
  if (!listCatalogCountries().includes(canonicalCountryName)) {
    throw new QuotaTargetError('invalid_country', `Unrecognized country: ${country}`)
  }
  const canonicalRegion = canonicalNseRegion(canonicalCountryName, region)
  if (!canonicalRegion) {
    throw new QuotaTargetError('invalid_region', `Region "${region}" is not valid for ${canonicalCountryName}`, {
      validRegions: listNseRegionsForCountry(canonicalCountryName),
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

export async function listRegionCaps(): Promise<(RegionCapRow & { achieved: number })[]> {
  const rows = await db.select().from(quotaRegionCaps)
  return Promise.all(
    rows.map(async (row) => ({ ...row, achieved: await countRegionAchieved(row.country, row.region) })),
  )
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
