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

/**
 * Same per-country target as groupProgressByCountry (still nse-only, so a region's
 * target isn't triple-counted across its OR-matched dimensions — see funnel.ts), but
 * `achieved` comes from countQualifiedLeadsByCountry instead: every lead that actually
 * qualified for that country, whether via nse, edad, integrantes, or the exception path
 * — the per-cell "Progreso por región y nivel NSE" table below still shows nse-only
 * attribution for capacity planning; this is only the country-level total. Includes
 * countries with qualified leads but no nse quota_targets rows configured (target: 0).
 */
export function buildCountrySummary(
  nseItems: QuotaProgress[],
  qualifiedByCountry: Map<string, number>,
): CountrySummary[] {
  const targetByCountry = new Map<string, number>()
  for (const item of nseItems) {
    targetByCountry.set(item.country, (targetByCountry.get(item.country) ?? 0) + item.target)
  }

  const countries = new Set([...targetByCountry.keys(), ...qualifiedByCountry.keys()])

  return [...countries]
    .map((country) => {
      const target = targetByCountry.get(country) ?? 0
      const achieved = qualifiedByCountry.get(country) ?? 0
      return {
        country,
        target,
        achieved,
        pct: target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
      }
    })
    .sort((a, b) => b.target - a.target)
}
