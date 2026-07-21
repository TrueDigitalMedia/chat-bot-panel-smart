import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaTargets } from '@/lib/db/schema'
import {
  canonicalCountry,
  canonicalNseRegion,
  listCatalogCountries,
  listNseRegionsForCountry,
} from '@/lib/geo/cam-nse-catalog'
import {
  NSE_LEVELS,
  AGE_BANDS,
  HOUSEHOLD_BANDS,
  DIMENSION_TYPES,
  type NseLevel,
  type DimensionType,
} from '@/lib/quotas/dimension-catalog'

// Re-exported for backward compatibility — existing importers (e.g. the dashboard) use
// these from here; the values themselves live in dimension-catalog.ts (no DB import) so
// client components can use them without pulling in the DB client (research.md R3).
export { NSE_LEVELS, AGE_BANDS, HOUSEHOLD_BANDS, DIMENSION_TYPES }
export type { NseLevel, DimensionType }

/** Valid `dimension_value`s per `dimension_type` — see specs/011-flexible-quota-matching/data-model.md. */
const DIMENSION_VALUES: Record<DimensionType, readonly string[]> = {
  nse: NSE_LEVELS,
  edad: AGE_BANDS,
  integrantes: HOUSEHOLD_BANDS,
}

export type QuotaTargetErrorCode =
  | 'invalid_country'
  | 'invalid_region'
  | 'invalid_dimension_type'
  | 'invalid_dimension_value'
  | 'invalid_target_count'

export class QuotaTargetError extends Error {
  code: QuotaTargetErrorCode
  validRegions?: string[]
  validValues?: readonly string[]

  constructor(
    code: QuotaTargetErrorCode,
    message: string,
    extra?: { validRegions?: string[]; validValues?: readonly string[] },
  ) {
    super(message)
    this.code = code
    this.validRegions = extra?.validRegions
    this.validValues = extra?.validValues
  }
}

export class QuotaTargetConflictError extends Error {}
export class QuotaTargetNotFoundError extends Error {}

export interface QuotaTargetInput {
  country: string
  region: string
  dimensionType: string
  dimensionValue: string
  targetCount?: number
  notes?: string | null
}

/** Validates and canonicalizes country/region/dimensionType/dimensionValue against the catalogs (research.md R3). */
function validateAndCanonicalize(input: QuotaTargetInput): {
  country: string
  region: string
  dimensionType: DimensionType
  dimensionValue: string
} {
  const country = canonicalCountry(input.country) ?? input.country
  if (!listCatalogCountries().includes(country)) {
    throw new QuotaTargetError('invalid_country', `Unrecognized country: ${input.country}`)
  }

  const region = canonicalNseRegion(country, input.region)
  if (!region) {
    throw new QuotaTargetError('invalid_region', `Region "${input.region}" is not valid for ${country}`, {
      validRegions: listNseRegionsForCountry(country),
    })
  }

  if (!DIMENSION_TYPES.includes(input.dimensionType as DimensionType)) {
    throw new QuotaTargetError('invalid_dimension_type', `Invalid dimension type: ${input.dimensionType}`, {
      validValues: DIMENSION_TYPES,
    })
  }
  const dimensionType = input.dimensionType as DimensionType

  const validValues = DIMENSION_VALUES[dimensionType]
  if (!validValues.includes(input.dimensionValue)) {
    throw new QuotaTargetError(
      'invalid_dimension_value',
      `Invalid ${dimensionType} value: ${input.dimensionValue}`,
      { validValues },
    )
  }

  if (input.targetCount != null && input.targetCount < 0) {
    throw new QuotaTargetError('invalid_target_count', 'targetCount must be >= 0')
  }

  return { country, region, dimensionType, dimensionValue: input.dimensionValue }
}

export interface QuotaTargetListFilters {
  country?: string
  region?: string
  dimensionType?: string
  dimensionValue?: string
  active?: boolean
}

export async function listQuotaTargets(filters: QuotaTargetListFilters = {}) {
  const conditions = []
  if (filters.country) conditions.push(eq(quotaTargets.country, filters.country))
  if (filters.region) conditions.push(eq(quotaTargets.region, filters.region))
  if (filters.dimensionType) conditions.push(eq(quotaTargets.dimensionType, filters.dimensionType))
  if (filters.dimensionValue) conditions.push(eq(quotaTargets.dimensionValue, filters.dimensionValue))
  if (filters.active !== undefined) conditions.push(eq(quotaTargets.active, filters.active))

  return db
    .select()
    .from(quotaTargets)
    .where(conditions.length ? and(...conditions) : undefined)
}

export async function createQuotaTarget(input: QuotaTargetInput) {
  const { country, region, dimensionType, dimensionValue } = validateAndCanonicalize(input)

  const [existing] = await db
    .select({ id: quotaTargets.id })
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
  if (existing) {
    throw new QuotaTargetConflictError(
      `Quota target already exists for ${country} / ${region} / ${dimensionType} / ${dimensionValue} — use PUT to edit it`,
    )
  }

  const [row] = await db
    .insert(quotaTargets)
    .values({
      country,
      region,
      dimensionType,
      dimensionValue,
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

/** Insert-or-update by (country, region, dimensionType, dimensionValue) — used by the Excel importer (US3). */
export async function upsertQuotaTarget(input: QuotaTargetInput) {
  const { country, region, dimensionType, dimensionValue } = validateAndCanonicalize(input)

  const [row] = await db
    .insert(quotaTargets)
    .values({
      country,
      region,
      dimensionType,
      dimensionValue,
      targetCount: input.targetCount ?? 0,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [quotaTargets.country, quotaTargets.region, quotaTargets.dimensionType, quotaTargets.dimensionValue],
      set: { targetCount: input.targetCount ?? 0, updatedAt: new Date() },
    })
    .returning()
  return row
}
