import { getQuotaProgressForTarget } from '@/lib/quotas/quota-progress'

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
