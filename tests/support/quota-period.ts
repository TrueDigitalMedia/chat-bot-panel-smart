import { getOpenPeriod, openQuotaPeriod, type QuotaPeriodRow } from '@/lib/quotas/quota-periods'

/**
 * Devuelve el periodo abierto del país, abriéndolo si no existe (spec 018).
 *
 * Toda cuota cuelga de un periodo, así que cualquier fixture que siembre `quota_targets` o
 * `quota_region_caps` necesita uno. Idempotente, para que los specs se puedan correr repetidas
 * veces contra la misma DB sin chocar con el índice de "un solo abierto por país".
 */
export async function ensureOpenPeriod(country: string): Promise<QuotaPeriodRow> {
  const existing = await getOpenPeriod(country)
  if (existing) return existing

  const now = new Date()
  const year = now.getUTCFullYear()
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1
  return openQuotaPeriod({
    country,
    quarter,
    year,
    startsOn: new Date(Date.UTC(year, (quarter - 1) * 3, 1)).toISOString().slice(0, 10),
    endsOn: new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10),
    notes: 'Periodo de prueba (tests/support/quota-period.ts)',
  })
}
