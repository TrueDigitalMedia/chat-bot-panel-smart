import { and, eq, inArray, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { quotaTargets } from '@/lib/db/schema'
import { getQuotaPeriod } from '@/lib/quotas/quota-periods'
import { resolvePeriodIds } from '@/lib/quotas/quota-progress'
import { canonicalCountry } from '@/lib/geo/cam-nse-catalog'
import {
  isSupportedCountry,
  getCountryConfig,
  listNseRegionsForSupportedCountry,
  canonicalNseRegionForSupportedCountry,
} from '@/lib/countries/registry'
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

/**
 * Valid `dimension_value`s per `dimension_type` — see specs/011-flexible-quota-matching/data-model.md.
 * `nse` is country-specific (CAM's "Nivel 1-4" vs Ecuador's "AB"/"C"/"D/E" — spec 014
 * FR-009/FR-014) and resolved per-call via `getCountryConfig(country).nseLevels` instead
 * of this fixed table; `edad`/`integrantes` are shared across every country (FR-012).
 */
const DIMENSION_VALUES: Record<Exclude<DimensionType, 'nse'>, readonly string[]> = {
  edad: AGE_BANDS,
  integrantes: HOUSEHOLD_BANDS,
}

export type QuotaTargetErrorCode =
  | 'invalid_country'
  | 'invalid_region'
  | 'invalid_dimension_type'
  | 'invalid_dimension_value'
  | 'invalid_target_count'
  | 'invalid_period'
  | 'period_closed'
  | 'country_mismatch'

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

/**
 * Toda escritura de configuración de cuota pasa por acá: el periodo tiene que existir, estar
 * ABIERTO y ser del mismo país que la fila. Sin esto, el panel podría reescribir en silencio los
 * objetivos de un trimestre ya congelado y el corte dejaría de cuadrar con lo que se corrió.
 *
 * Exportada porque region-caps.ts aplica exactamente la misma regla a los topes por región.
 */
export async function assertPeriodWritable(periodId: string, country: string): Promise<void> {
  if (!periodId) {
    throw new QuotaTargetError('invalid_period', 'periodId is required')
  }
  const period = await getQuotaPeriod(periodId)
  if (!period) {
    throw new QuotaTargetError('invalid_period', `Quota period not found: ${periodId}`)
  }
  if (period.status !== 'open') {
    throw new QuotaTargetError(
      'period_closed',
      `El periodo ${period.label} de ${period.country} está cerrado — reabrilo o abrí uno nuevo para editar cuotas`,
    )
  }
  if (period.country !== country) {
    throw new QuotaTargetError(
      'country_mismatch',
      `El periodo ${period.label} es de ${period.country}, no de ${country}`,
    )
  }
}

export interface QuotaTargetInput {
  periodId: string
  country: string
  region: string
  dimensionType: string
  dimensionValue: string
  targetCount?: number
  notes?: string | null
}

/**
 * Validates and canonicalizes country/region/dimensionType/dimensionValue against the catalogs
 * (research.md R3) AND checks that the target period is open and belongs to the same country.
 */
async function validateAndCanonicalize(input: QuotaTargetInput): Promise<{
  country: string
  region: string
  dimensionType: DimensionType
  dimensionValue: string
}> {
  const country = canonicalCountry(input.country) ?? input.country
  if (!isSupportedCountry(country)) {
    throw new QuotaTargetError('invalid_country', `Unrecognized country: ${input.country}`)
  }

  const region = canonicalNseRegionForSupportedCountry(country, input.region)
  if (!region) {
    throw new QuotaTargetError('invalid_region', `Region "${input.region}" is not valid for ${country}`, {
      validRegions: [...listNseRegionsForSupportedCountry(country)],
    })
  }

  if (!DIMENSION_TYPES.includes(input.dimensionType as DimensionType)) {
    throw new QuotaTargetError('invalid_dimension_type', `Invalid dimension type: ${input.dimensionType}`, {
      validValues: DIMENSION_TYPES,
    })
  }
  const dimensionType = input.dimensionType as DimensionType

  const validValues = dimensionType === 'nse' ? getCountryConfig(country).nseLevels : DIMENSION_VALUES[dimensionType]
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

  await assertPeriodWritable(input.periodId, country)

  return { country, region, dimensionType, dimensionValue: input.dimensionValue }
}

export interface QuotaTargetListFilters {
  /** One period. Both this and `periodIds` absent ⇒ every OPEN period (see resolvePeriodIds). */
  periodId?: string
  periodIds?: string[]
  country?: string
  region?: string
  dimensionType?: string
  dimensionValue?: string
  active?: boolean
}

export async function listQuotaTargets(filters: QuotaTargetListFilters = {}) {
  const periodIds = await resolvePeriodIds(filters)
  if (periodIds.length === 0) return []

  const conditions: SQL[] = [inArray(quotaTargets.periodId, periodIds)]
  if (filters.country) conditions.push(eq(quotaTargets.country, filters.country))
  if (filters.region) conditions.push(eq(quotaTargets.region, filters.region))
  if (filters.dimensionType) conditions.push(eq(quotaTargets.dimensionType, filters.dimensionType))
  if (filters.dimensionValue) conditions.push(eq(quotaTargets.dimensionValue, filters.dimensionValue))
  if (filters.active !== undefined) conditions.push(eq(quotaTargets.active, filters.active))

  return db.select().from(quotaTargets).where(and(...conditions))
}

export async function createQuotaTarget(input: QuotaTargetInput) {
  const { country, region, dimensionType, dimensionValue } = await validateAndCanonicalize(input)

  const [existing] = await db
    .select({ id: quotaTargets.id })
    .from(quotaTargets)
    .where(
      and(
        eq(quotaTargets.periodId, input.periodId),
        eq(quotaTargets.region, region),
        eq(quotaTargets.dimensionType, dimensionType),
        eq(quotaTargets.dimensionValue, dimensionValue),
      ),
    )
    .limit(1)
  if (existing) {
    throw new QuotaTargetConflictError(
      `Quota target already exists for ${country} / ${region} / ${dimensionType} / ${dimensionValue} in this period — use PUT to edit it`,
    )
  }

  const [row] = await db
    .insert(quotaTargets)
    .values({
      periodId: input.periodId,
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

  const [current] = await db
    .select({ periodId: quotaTargets.periodId, country: quotaTargets.country })
    .from(quotaTargets)
    .where(eq(quotaTargets.id, id))
    .limit(1)
  if (!current) {
    throw new QuotaTargetNotFoundError(`Quota target not found: ${id}`)
  }
  await assertPeriodWritable(current.periodId, current.country)

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

/**
 * Insert-or-update by (periodId, region, dimensionType, dimensionValue) — used by the Excel
 * importer (US3).
 *
 * El `target` del ON CONFLICT tiene que coincidir EXACTAMENTE con el índice único
 * `quota_targets_period_region_dim_idx`: drizzle emite esa tupla literal en el SQL, así que un
 * desajuste no lo ve TypeScript, revienta en runtime con "there is no unique or exclusion
 * constraint matching the ON CONFLICT specification".
 */
export async function upsertQuotaTarget(input: QuotaTargetInput) {
  const { country, region, dimensionType, dimensionValue } = await validateAndCanonicalize(input)

  const [row] = await db
    .insert(quotaTargets)
    .values({
      periodId: input.periodId,
      country,
      region,
      dimensionType,
      dimensionValue,
      targetCount: input.targetCount ?? 0,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [
        quotaTargets.periodId,
        quotaTargets.region,
        quotaTargets.dimensionType,
        quotaTargets.dimensionValue,
      ],
      set: { targetCount: input.targetCount ?? 0, updatedAt: new Date() },
    })
    .returning()
  return row
}
