import { ageBand, householdBand } from '@/lib/quotas/quota-bands'
import { getQuotaProgressForTarget } from '@/lib/quotas/quota-progress'
import { getRegionCapProgress } from '@/lib/quotas/region-caps'
import type { DimensionType } from '@/lib/quotas/quota-targets'
import { syncLeadPhase1Complete } from '@/lib/tdm-mysql/sync'
import type { Lead } from '@/types/lead'

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

export interface QuotaDecision {
  qualifies: boolean
  matchedDimension: DimensionType | 'exception' | null
  matchedValue: string | null
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
  extra: { regionCapBlocked: boolean },
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
      region_cap_blocked: extra.regionCapBlocked,
      decision: decision.qualifies,
    }),
  )
}

/**
 * Real quota check against `quota_targets` + `quota_region_caps` (spec 011 — replaces the
 * single country+region+NSE AND-match from spec 005 with OR-matching across independent
 * dimensions). See specs/011-flexible-quota-matching/contracts/quota-check-contract.md.
 */
export async function checkQuotaAvailability(params: CheckQuotaAvailabilityParams): Promise<QuotaDecision> {
  const { country, nseRegion } = params

  // 1. Pregnancy / baby-under-36-months exception — always qualifies, never blocked.
  if (params.isPregnant || params.hasBabyUnder3) {
    const decision: QuotaDecision = { qualifies: true, matchedDimension: 'exception', matchedValue: null }
    logQuotaCheck(params, decision, { regionCapBlocked: false })
    return decision
  }

  // 2. Region aggregate cap gate (manual, independent of per-dimension targets).
  const regionCap = await getRegionCapProgress(country, nseRegion)
  const regionCapBlocked = regionCap != null && regionCap.cap != null && regionCap.achieved >= regionCap.cap
  if (regionCapBlocked) {
    const decision: QuotaDecision = { qualifies: false, matchedDimension: null, matchedValue: null }
    logQuotaCheck(params, decision, { regionCapBlocked: true })
    return decision
  }

  // 3. OR-match across dimensions in fixed order; first one with available quota wins.
  for (const dimension of DIMENSION_ORDER) {
    const value = dimension.value(params)
    if (value == null) continue

    const progress = await getQuotaProgressForTarget(country, nseRegion, dimension.type, value)
    if (progress != null && progress.active && progress.available > 0) {
      const decision: QuotaDecision = { qualifies: true, matchedDimension: dimension.type, matchedValue: value }
      logQuotaCheck(params, decision, { regionCapBlocked: false })
      return decision
    }
  }

  const decision: QuotaDecision = { qualifies: false, matchedDimension: null, matchedValue: null }
  logQuotaCheck(params, decision, { regionCapBlocked: false })
  return decision
}

/**
 * Fire-and-forget side effect shared by the two call sites that transition a lead to
 * `link_sent` after quota confirms available (handle-confirm.ts and phase-1.ts) — kept
 * as one helper so the TDM sync call isn't duplicated across both paths. Never blocks
 * or breaks the caller: `syncLeadPhase1Complete` never throws on its own, and the
 * `.catch` here is a second line of defense.
 */
export async function finalizeQuotaPassedLead(lead: Lead, correlationId: string): Promise<void> {
  await syncLeadPhase1Complete(lead.id, correlationId).catch(() => {})
}
