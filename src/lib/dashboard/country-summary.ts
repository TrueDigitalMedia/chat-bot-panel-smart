import type { QuotaProgress } from '@/lib/quotas/quota-progress'

export interface CountrySummary {
  country: string
  target: number
  achieved: number
  pct: number
}

/** Aggregates QuotaProgress rows by country for the dashboard's per-country bar chart. */
export function groupProgressByCountry(items: QuotaProgress[]): CountrySummary[] {
  const byCountry = new Map<string, { target: number; achieved: number }>()

  for (const item of items) {
    const entry = byCountry.get(item.country) ?? { target: 0, achieved: 0 }
    entry.target += item.target
    entry.achieved += item.achieved
    byCountry.set(item.country, entry)
  }

  return [...byCountry.entries()]
    .map(([country, { target, achieved }]) => ({
      country,
      target,
      achieved,
      pct: target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
    }))
    .sort((a, b) => b.target - a.target)
}
