import { getQuotaProgressForTarget } from '@/lib/quotas/quota-progress'
import { syncLeadPhase1Complete } from '@/lib/tdm-mysql/sync'
import type { Lead } from '@/types/lead'

interface CheckQuotaAvailabilityParams {
  country: string
  nseRegion: string
  segment: string
  leadId?: string
}

/**
 * Real quota check against `quota_targets` (replaces the old random mock).
 * No target row for the combination → treated as unavailable (spec 005 edge case).
 */
export async function checkQuotaAvailability({
  country,
  nseRegion,
  segment,
  leadId,
}: CheckQuotaAvailabilityParams): Promise<boolean> {
  const progress = await getQuotaProgressForTarget(country, nseRegion, segment)
  const available = progress != null && progress.active && progress.available > 0

  console.log(
    JSON.stringify({
      event: 'quota_check',
      lead_id: leadId ?? null,
      country,
      region: nseRegion,
      segment,
      target: progress?.target ?? 0,
      achieved: progress?.achieved ?? 0,
      available_count: progress?.available ?? 0,
      active: progress?.active ?? false,
      decision: available,
    }),
  )

  return available
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
