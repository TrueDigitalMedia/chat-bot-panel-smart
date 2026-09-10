import { ageBand, householdBand } from '@/lib/quotas/quota-bands'
import { getQuotaProgressForTarget, getHighestVolumeNseTarget } from '@/lib/quotas/quota-progress'
import { getRegionObjective } from '@/lib/quotas/region-caps'
import type { DimensionType } from '@/lib/quotas/quota-targets'

interface CheckQuotaAvailabilityParams {
  country: string
  nseRegion: string
  segment: string
  age: number | null
  householdSize: number | null
  isPregnant: boolean | null
  hasBabyUnder3: boolean | null
  leadId?: string
}

/** Why a lead did NOT qualify — for audit/dashboard segmentation (not persisted; logged). */
export type QuotaDeniedReason =
  | 'region_no_identificada'
  | 'region_fuera_de_muestra'
  | 'region_completa'
  | 'sin_cupo'

export interface QuotaDecision {
  qualifies: boolean
  matchedDimension: DimensionType | 'exception' | null
  matchedValue: string | null
  deniedReason?: QuotaDeniedReason
}

/**
 * Evaluated in this fixed order (research.md R5, spec 011 Q2): a lead qualifies via the
 * FIRST dimension in this list that has available quota, and only that dimension's
 * "achieved" counter is decremented — not every dimension the lead also happens to satisfy.
 */
const DIMENSION_ORDER: readonly { type: DimensionType; value: (params: CheckQuotaAvailabilityParams) => string | null }[] =
  [
    { type: 'nse', value: (p) => p.segment },
    { type: 'edad', value: (p) => ageBand(p.age) },
    { type: 'integrantes', value: (p) => householdBand(p.householdSize) },
  ]

function logQuotaCheck(
  params: CheckQuotaAvailabilityParams,
  decision: QuotaDecision,
  extra: { regionObjective: number | null; regionAchieved: number | null; regionBlocked: boolean },
): void {
  console.log(
    JSON.stringify({
      event: 'quota_check',
      lead_id: params.leadId ?? null,
      country: params.country,
      region: params.nseRegion,
      segment: params.segment,
      age: params.age,
      household_size: params.householdSize,
      is_pregnant: params.isPregnant,
      has_baby_under_3: params.hasBabyUnder3,
      matched_dimension: decision.matchedDimension,
      matched_value: decision.matchedValue,
      denied_reason: decision.deniedReason ?? null,
      region_objective: extra.regionObjective,
      region_achieved: extra.regionAchieved,
      // kept for existing log consumers — now means "blocked by the region objective ceiling"
      region_cap_blocked: extra.regionBlocked,
      decision: decision.qualifies,
    }),
  )
}

/**
 * Quota check (PUNTO 1 clarification, 2026-09-10 — supersedes the spec 011 model where the
 * region cap was manual/optional and the pregnancy exception was never blocked).
 *
 * The client's requested panelist count per country+region is the FIRST and hard ceiling
 * for everyone. Only within a region that still has room:
 *   - the pregnancy / baby-under-36-months exception qualifies without checking any
 *     specific NSE/edad/integrantes cell, and
 *   - a lead whose own NSE cell is full still qualifies if edad or integrantes has demand,
 *   both charged to the region's highest-volume NSE line so it advances toward its
 *   objective and deactivates on time.
 * A region with no objective configured (out of the client sample — e.g. Centro I) is
 * CLOSED: nothing qualifies, exception included.
 */
export async function checkQuotaAvailability(params: CheckQuotaAvailabilityParams): Promise<QuotaDecision> {
  const { country, nseRegion } = params

  // 0. The region (PUNTO 1 "primer condicional") must be identified at all.
  if (!nseRegion) {
    const decision: QuotaDecision = {
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_no_identificada',
    }
    logQuotaCheck(params, decision, { regionObjective: null, regionAchieved: null, regionBlocked: true })
    return decision
  }

  // 1. Region objective — the hard ceiling for EVERY lead, exception included.
  const region = await getRegionObjective(country, nseRegion)

  if (region.objective <= 0) {
    // No demand configured for this region → out of the client sample → closed.
    const decision: QuotaDecision = {
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_fuera_de_muestra',
    }
    logQuotaCheck(params, decision, { regionObjective: 0, regionAchieved: region.achieved, regionBlocked: true })
    return decision
  }

  if (region.achieved >= region.objective) {
    const decision: QuotaDecision = {
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_completa',
    }
    logQuotaCheck(params, decision, {
      regionObjective: region.objective,
      regionAchieved: region.achieved,
      regionBlocked: true,
    })
    return decision
  }

  const logExtra = {
    regionObjective: region.objective,
    regionAchieved: region.achieved,
    regionBlocked: false,
  }

  // 2. Pregnancy / baby-under-36-months exception — skips the per-dimension cells but is
  // still bounded by the region objective (checked above). Charged to the region's
  // highest-volume NSE line so that line fills and deactivates on time.
  if (params.isPregnant || params.hasBabyUnder3) {
    const nseLine = await getHighestVolumeNseTarget(country, nseRegion)
    const decision: QuotaDecision = nseLine
      ? { qualifies: true, matchedDimension: 'nse', matchedValue: nseLine.dimensionValue }
      : { qualifies: true, matchedDimension: 'exception', matchedValue: null }
    logQuotaCheck(params, decision, logExtra)
    return decision
  }

  // 3. OR-match NSE → edad → integrantes. A match on the lead's own NSE line books that
  // line; a match on edad/integrantes (its NSE line being full) still books the region's
  // highest-volume NSE line — the "conditionals" only complete the region+NSE quota, they
  // never open extra capacity.
  for (const dimension of DIMENSION_ORDER) {
    const value = dimension.value(params)
    if (value == null) continue

    const progress = await getQuotaProgressForTarget(country, nseRegion, dimension.type, value)
    if (progress != null && progress.active && progress.available > 0) {
      if (dimension.type === 'nse') {
        const decision: QuotaDecision = { qualifies: true, matchedDimension: 'nse', matchedValue: value }
        logQuotaCheck(params, decision, logExtra)
        return decision
      }
      const nseLine = await getHighestVolumeNseTarget(country, nseRegion)
      const decision: QuotaDecision = nseLine
        ? { qualifies: true, matchedDimension: 'nse', matchedValue: nseLine.dimensionValue }
        : { qualifies: true, matchedDimension: dimension.type, matchedValue: value }
      logQuotaCheck(params, decision, logExtra)
      return decision
    }
  }

  const decision: QuotaDecision = {
    qualifies: false,
    matchedDimension: null,
    matchedValue: null,
    deniedReason: 'sin_cupo',
  }
  logQuotaCheck(params, decision, logExtra)
  return decision
}

const DIMENSION_LABELS: Record<DimensionType, string> = {
  nse: 'nivel socioeconómico (NSE)',
  edad: 'rango de edad',
  integrantes: 'número de integrantes del hogar',
}

/** Human-readable (Spanish) explanation of why a lead qualified, for the AI conversation summary. */
export function describeQuotaMatch(
  matchedDimension: DimensionType | 'exception' | string | null,
  matchedValue: string | null,
): string | null {
  if (matchedDimension === 'exception') {
    return 'excepción por embarazo o bebé menor a 36 meses'
  }
  if (matchedDimension && matchedDimension in DIMENSION_LABELS) {
    const label = DIMENSION_LABELS[matchedDimension as DimensionType]
    return matchedValue ? `${label}: ${matchedValue}` : label
  }
  return null
}
