import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaTargets } from '@/lib/db/schema'
import {
  canonicalCountry,
  canonicalNseRegion,
  listCatalogCountries,
  listNseRegionsForCountry,
} from '@/lib/geo/cam-nse-catalog'

export const NSE_LEVELS = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'] as const
export type NseLevel = (typeof NSE_LEVELS)[number]

export type QuotaTargetErrorCode = 'invalid_country' | 'invalid_region' | 'invalid_nse_level' | 'invalid_target_count'

export class QuotaTargetError extends Error {
  code: QuotaTargetErrorCode
  validRegions?: string[]

  constructor(code: QuotaTargetErrorCode, message: string, validRegions?: string[]) {
    super(message)
    this.code = code
    this.validRegions = validRegions
  }
}

export class QuotaTargetConflictError extends Error {}
export class QuotaTargetNotFoundError extends Error {}

export interface QuotaTargetInput {
  country: string
  region: string
  nseLevel: string
  targetCount?: number
  notes?: string | null
}

/** Validates and canonicalizes country/region/nseLevel against the geo catalog (research.md R3). */
function validateAndCanonicalize(input: QuotaTargetInput): {
  country: string
  region: string
  nseLevel: NseLevel
} {
  const country = canonicalCountry(input.country) ?? input.country
  if (!listCatalogCountries().includes(country)) {
    throw new QuotaTargetError('invalid_country', `Unrecognized country: ${input.country}`)
  }

  const region = canonicalNseRegion(country, input.region)
  if (!region) {
    throw new QuotaTargetError(
      'invalid_region',
      `Region "${input.region}" is not valid for ${country}`,
      listNseRegionsForCountry(country),
    )
  }

  if (!NSE_LEVELS.includes(input.nseLevel as NseLevel)) {
    throw new QuotaTargetError('invalid_nse_level', `Invalid NSE level: ${input.nseLevel}`)
  }

  if (input.targetCount != null && input.targetCount < 0) {
    throw new QuotaTargetError('invalid_target_count', 'targetCount must be >= 0')
  }

  return { country, region, nseLevel: input.nseLevel as NseLevel }
}

export interface QuotaTargetListFilters {
  country?: string
  region?: string
  nseLevel?: string
  active?: boolean
}

export async function listQuotaTargets(filters: QuotaTargetListFilters = {}) {
  const conditions = []
  if (filters.country) conditions.push(eq(quotaTargets.country, filters.country))
  if (filters.region) conditions.push(eq(quotaTargets.region, filters.region))
  if (filters.nseLevel) conditions.push(eq(quotaTargets.nseLevel, filters.nseLevel))
  if (filters.active !== undefined) conditions.push(eq(quotaTargets.active, filters.active))

  return db
    .select()
    .from(quotaTargets)
    .where(conditions.length ? and(...conditions) : undefined)
}

export async function createQuotaTarget(input: QuotaTargetInput) {
  const { country, region, nseLevel } = validateAndCanonicalize(input)

  const [existing] = await db
    .select({ id: quotaTargets.id })
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.country, country),
        eq(quotaTargets.region, region),
        eq(quotaTargets.nseLevel, nseLevel),
      ),
    )
    .limit(1)
  if (existing) {
    throw new QuotaTargetConflictError(
      `Quota target already exists for ${country} / ${region} / ${nseLevel} — use PUT to edit it`,
    )
  }

  const [row] = await db
    .insert(quotaTargets)
    .values({
      country,
      region,
      nseLevel,
      targetCount: input.targetCount ?? 0,
      notes: input.notes ?? null,
    })
    .returning()
  return row
}

export interface QuotaTargetPatch {
  targetCount?: number
  active?: boolean
  notes?: string | null
}

export async function updateQuotaTarget(id: string, patch: QuotaTargetPatch) {
  if (patch.targetCount != null && patch.targetCount < 0) {
    throw new QuotaTargetError('invalid_target_count', 'targetCount must be >= 0')
  }

  const [row] = await db
    .update(quotaTargets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(quotaTargets.id, id))
    .returning()

  if (!row) {
    throw new QuotaTargetNotFoundError(`Quota target not found: ${id}`)
  }
  return row
}

/** Insert-or-update by (country, region, nseLevel) — used by the Excel importer (US3). */
export async function upsertQuotaTarget(input: QuotaTargetInput) {
  const { country, region, nseLevel } = validateAndCanonicalize(input)

  const [row] = await db
    .insert(quotaTargets)
    .values({
      country,
      region,
      nseLevel,
      targetCount: input.targetCount ?? 0,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [quotaTargets.country, quotaTargets.region, quotaTargets.nseLevel],
      set: { targetCount: input.targetCount ?? 0, updatedAt: new Date() },
    })
    .returning()
  return row
}
