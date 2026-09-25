import { ageBand, householdBand } from '@/lib/quotas/quota-bands'
import { getQuotaProgressForTarget, getHighestVolumeNseTargetWithRoom } from '@/lib/quotas/quota-progress'
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

export interface RegionQuotaStatus {
  open: boolean
  deniedReason?: 'region_no_identificada' | 'region_fuera_de_muestra' | 'region_completa'
  /** null only when `nseRegion` itself was null (never looked up). */
  regionObjective: number | null
  regionAchieved: number | null
  /** Where `regionObjective` came from — see getRegionObjective. Null only when never looked up. */
  regionSource: 'cap' | 'nse_sum' | 'none' | null
}

/**
 * The region-objective ceiling alone (PUNTO 1 "primer condicional", steps 0-1 of
 * checkQuotaAvailability below) — the hard ceiling for EVERY lead, exception included, so
 * once it says closed nothing later in the survey (NSE segment, edad, integrantes, even the
 * pregnancy/baby exception) can ever turn that into a qualify. Exported so the geo-capture
 * flow (gps-capture.ts) can end the conversation as soon as `nseRegion` resolves to a
 * closed region, instead of asking the rest of the survey only to reject at the very end —
 * that's wasted message volume and a worse experience for a lead that was never going to
 * qualify. checkQuotaAvailability calls this same function for its own steps 0-1, so the
 * early-exit and the end-of-survey decision can never drift apart.
 *
 * Deliberately does NOT special-case a null `nseRegion` any differently from a resolved-but-
 * closed one — both already end a lead identically in checkQuotaAvailability. Callers that
 * want to keep asking while the region is merely *unresolved* (Ecuador's Quito/Guayaquil,
 * whose canton alone is ambiguous until the parroquia/Q5 answer splits it — see
 * gps-capture.ts's applyManualMunicipalityAllowlist) should only call this once `nseRegion`
 * is non-null, not on every intermediate geo answer.
 */
export async function checkRegionQuota(country: string, nseRegion: string | null): Promise<RegionQuotaStatus> {
  if (!nseRegion) {
    return {
      open: false,
      deniedReason: 'region_no_identificada',
      regionObjective: null,
      regionAchieved: null,
      regionSource: null,
    }
  }
  const region = await getRegionObjective(country, nseRegion)
  if (region.objective <= 0) {
    return {
      open: false,
      deniedReason: 'region_fuera_de_muestra',
      regionObjective: 0,
      regionAchieved: region.achieved,
      regionSource: region.source,
    }
  }
  if (region.achieved >= region.objective) {
    return {
      open: false,
      deniedReason: 'region_completa',
      regionObjective: region.objective,
      regionAchieved: region.achieved,
      regionSource: region.source,
    }
  }
  return {
    open: true,
    regionObjective: region.objective,
    regionAchieved: region.achieved,
    regionSource: region.source,
  }
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

  // 0-1. The region (PUNTO 1 "primer condicional") must be identified AND still have room —
  // the hard ceiling for EVERY lead, exception included. Same check the survey flow already
  // ran earlier, as soon as `nseRegion` resolved (gps-capture.ts) — repeated here so this
  // function stays correct standalone, and for the leads whose region wasn't resolvable yet
  // at that point (Ecuador's Quito/Guayaquil, pending the parroquia/Q5 answer).
  const regionStatus = await checkRegionQuota(country, nseRegion || null)
  if (!regionStatus.open) {
    const decision: QuotaDecision = {
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: regionStatus.deniedReason,
    }
    logQuotaCheck(params, decision, {
      regionObjective: regionStatus.regionObjective,
      regionAchieved: regionStatus.regionAchieved,
      regionBlocked: true,
    })
    return decision
  }

  const logExtra = {
    regionObjective: regionStatus.regionObjective,
    regionAchieved: regionStatus.regionAchieved,
    regionBlocked: false,
  }

  // The country+region+NSE line is ALSO a hard cap: every conditional-qualified lead must
  // be charged to an NSE line that still has room, and no line may pass its own objective.
  // If every NSE line is full the region is done — even the pregnancy/baby exception.
  const openNseLine = await getHighestVolumeNseTargetWithRoom(country, nseRegion)

  // The lead's own NSE line — looked up before the exception branch so a conditional lead
  // is booked against the level they actually are whenever that level still has room.
  const ownNse = await getQuotaProgressForTarget(country, nseRegion, 'nse', params.segment)
  const ownNseHasRoom = ownNse != null && ownNse.active && ownNse.available > 0

  // 2. Pregnancy / baby-under-36-months exception — skips the *demand* check on the lead's
  // own NSE/edad/integrantes cell (that's what the exception is for), but is still bounded
  // by the region objective AND by there being an open NSE line to charge it to.
  //
  // Booked to the lead's OWN NSE line while that line has room, and only to the fallback
  // line when it doesn't (2026-09-25). Charging every exception to the region's biggest
  // line regardless was silently rewriting the sample's NSE mix: in Guatemala / Sur
  // Occidente Chico 13 of the 20 leads sitting in Nivel 4 were Nivel 1-3 people, so that
  // line read 95% while only 7 real Nivel 4 had been recruited and Nivel 2/3 kept
  // recruiting past their own objectives.
  if (params.isPregnant || params.hasBabyUnder3) {
    if (ownNseHasRoom) {
      const decision: QuotaDecision = {
        qualifies: true,
        matchedDimension: 'nse',
        matchedValue: params.segment,
      }
      logQuotaCheck(params, decision, logExtra)
      return decision
    }
    if (openNseLine) {
      const decision: QuotaDecision = {
        qualifies: true,
        matchedDimension: 'nse',
        matchedValue: openNseLine.dimensionValue,
      }
      logQuotaCheck(params, decision, logExtra)
      return decision
    }
    if (regionStatus.regionSource === 'cap') {
      const decision: QuotaDecision = { qualifies: true, matchedDimension: 'exception', matchedValue: null }
      logQuotaCheck(params, decision, logExtra)
      return decision
    }
    const decision: QuotaDecision = {
      qualifies: false,
      matchedDimension: null,
      matchedValue: null,
      deniedReason: 'region_completa',
    }
    logQuotaCheck(params, decision, { ...logExtra, regionBlocked: true })
    return decision
  }

  // 3. Own NSE line first — books that exact line while it has room (looked up above).
  if (ownNseHasRoom) {
    const decision: QuotaDecision = { qualifies: true, matchedDimension: 'nse', matchedValue: params.segment }
    logQuotaCheck(params, decision, logExtra)
    return decision
  }

  // 4. Own NSE line full → the "third conditional" (edad / integrantes) can still qualify
  // the lead IF that band has demand configured, but the lead is charged to another NSE
  // line that still has room — never opening extra capacity, never passing the region
  // total. No open NSE line ⇒ region done.
  for (const dimension of DIMENSION_ORDER) {
    if (dimension.type === 'nse') continue
    const value = dimension.value(params)
    if (value == null) continue

    const progress = await getQuotaProgressForTarget(country, nseRegion, dimension.type, value)
    if (progress != null && progress.active && progress.available > 0) {
      if (!openNseLine) break
      const decision: QuotaDecision = {
        qualifies: true,
        matchedDimension: 'nse',
        matchedValue: openNseLine.dimensionValue,
      }
      logQuotaCheck(params, decision, logExtra)
      return decision
    }
  }

  const decision: QuotaDecision = {
    qualifies: false,
    matchedDimension: null,
    matchedValue: null,
    deniedReason: openNseLine ? 'sin_cupo' : 'region_completa',
  }
  logQuotaCheck(params, decision, { ...logExtra, regionBlocked: !openNseLine })
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
