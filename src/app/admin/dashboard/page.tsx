import { listQuotaProgress, type QuotaProgress } from '@/lib/quotas/quota-progress'
import { groupProgressByCountry } from '@/lib/dashboard/country-summary'
import { getConversionFunnel } from '@/lib/dashboard/funnel'
import { NSE_LEVELS } from '@/lib/quotas/quota-targets'
import { listCatalogCountries, listNseRegionsForCountry } from '@/lib/geo/cam-nse-catalog'
import { isChannel } from '@/types/channel'
import { FiltersForm } from './filters-form'
import { RefreshPoller } from './refresh-poller'
import styles from './dashboard.module.css'

function pctColorClass(pct: number): string {
  if (pct < 25) return styles.pctLow
  if (pct < 75) return styles.pctMid
  return styles.pctHigh
}

interface DashboardSearchParams {
  country?: string
  region?: string
  nseLevel?: string
  channel?: string
  from?: string
  to?: string
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>
}) {
  const params = await searchParams
  const channel = params.channel && isChannel(params.channel) ? params.channel : undefined
  const dateFrom = params.from ? new Date(params.from) : undefined
  const dateTo = params.to ? new Date(params.to) : undefined

  const items = await listQuotaProgress({
    country: params.country || undefined,
    region: params.region || undefined,
    nseLevel: params.nseLevel || undefined,
    channel,
    dateFrom,
    dateTo,
  })
  // Deliberately no region/nseLevel here — research.md R4 (assigned upstream of NSE/region).
  const funnel = await getConversionFunnel({
    country: params.country || undefined,
    channel,
    dateFrom,
    dateTo,
  })

  const summary = items.reduce(
    (acc, item) => {
      acc.totalTarget += item.target
      acc.totalAchieved += item.achieved
      acc.totalAvailable += item.available
      return acc
    },
    { totalTarget: 0, totalAchieved: 0, totalAvailable: 0 },
  )
  const totalPct =
    summary.totalTarget > 0 ? Math.round((summary.totalAchieved / summary.totalTarget) * 100) : 0

  const countryChart = groupProgressByCountry(items)

  const catalogCountries = listCatalogCountries()
  const regionsByCountry = Object.fromEntries(
    catalogCountries.map((c) => [c, listNseRegionsForCountry(c)]),
  )

  const sortedByRegion = [...items].sort(
    (a, b) =>
      a.country.localeCompare(b.country) ||
      a.region.localeCompare(b.region) ||
      a.nseLevel.localeCompare(b.nseLevel),
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PanelSmart</p>
          <h1 className={styles.title}>Dashboard de leads</h1>
          <p className={styles.sub}>
            Progreso de reclutamiento en tiempo casi real, por país, región y nivel socioeconómico.
          </p>
        </div>
        <div className={styles.headerActions}>
          <RefreshPoller />
        </div>
      </header>

      <div className={styles.section}>
        <FiltersForm countries={catalogCountries} nseLevels={NSE_LEVELS} regionsByCountry={regionsByCountry} />
      </div>

      <div className={styles.section}>
        <div className={styles.summaryCards}>
          <div className={styles.card}>
            <span>Objetivo total</span>
            <strong>{summary.totalTarget}</strong>
          </div>
          <div className={styles.card}>
            <span>Conseguidos</span>
            <strong>{summary.totalAchieved}</strong>
          </div>
          <div className={styles.card}>
            <span>Disponibles</span>
            <strong>{summary.totalAvailable}</strong>
          </div>
          <div className={styles.card}>
            <span>% Avance</span>
            <strong>{totalPct}%</strong>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Progreso por país</h2>
        {countryChart.length === 0 ? (
          <div className={styles.chart}>
            <p className={styles.empty}>Aún no hay cuotas configuradas.</p>
          </div>
        ) : (
          <div className={styles.chart}>
            {countryChart.map((c) => (
              <div key={c.country} className={styles.chartRow}>
                <span className={styles.chartLabel}>{c.country}</span>
                <div className={styles.chartTrack}>
                  <div className={styles.chartFill} style={{ width: `${c.pct}%` }} />
                </div>
                <span className={styles.chartValue}>
                  {c.achieved}/{c.target} ({c.pct}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Progreso por región y nivel NSE</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>País</th>
                <th>Región</th>
                <th>Nivel</th>
                <th>Objetivo</th>
                <th>Conseguidos</th>
                <th>Disponibles</th>
                <th>% Avance</th>
              </tr>
            </thead>
            <tbody>
              {sortedByRegion.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Aún no hay cuotas configuradas.
                  </td>
                </tr>
              ) : (
                sortedByRegion.map((item: QuotaProgress) => (
                  <tr key={item.id}>
                    <td>{item.country}</td>
                    <td>{item.region}</td>
                    <td>{item.nseLevel}</td>
                    <td>{item.target}</td>
                    <td>{item.achieved}</td>
                    <td>{item.available}</td>
                    <td>
                      <span className={`${styles.pctBadge} ${pctColorClass(item.progressPct)}`}>
                        {item.progressPct}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Embudo de conversión</h2>
        <div className={styles.funnel}>
          {funnel.stages.map((stage) => (
            <div key={stage.key} className={styles.funnelRow}>
              <span className={styles.funnelLabel}>
                {stage.label}
                {stage.key === funnel.biggestDropStageKey ? (
                  <span className={styles.funnelDrop} title="Mayor caída">
                    ▼
                  </span>
                ) : null}
              </span>
              <div className={styles.chartTrack}>
                <div className={styles.chartFill} style={{ width: `${stage.pctOfTotal}%` }} />
              </div>
              <span className={styles.funnelPct}>{stage.count}</span>
              <span className={styles.funnelPct}>{stage.pctOfTotal}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
