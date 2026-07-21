import type { AgeBand, HouseholdBand } from '@/lib/quotas/dimension-catalog'

/** Buckets a survey-captured age into the quota age band (research.md R3). */
export function ageBand(age: number | null | undefined): AgeBand | null {
  if (age == null) return null
  if (age <= 34) return 'Hasta 34'
  if (age <= 49) return '35 a 49'
  return '50+'
}

/** Buckets a survey-captured household size into the quota integrantes band (research.md R3). */
export function householdBand(size: number | null | undefined): HouseholdBand | null {
  if (size == null) return null
  if (size <= 2) return '1 a 2'
  if (size <= 4) return '3 a 4'
  return '5+'
}
