import { listQuotaProgress } from '@/lib/quotas/quota-progress'
import { listRegionCaps } from '@/lib/quotas/region-caps'
import { listSupportedCountries, listNseRegionsForSupportedCountry, getCountryConfig } from '@/lib/countries/registry'
import { QuotaRowForm } from './quota-row-form'
import { NewQuotaTargetRow } from './new-quota-target-row'
import { ImportForm } from './import-form'
import { RegionCapForm } from './region-cap-form'
import { QuotaFiltersForm } from './quota-filters-form'
import styles from './quotas.module.css'

interface QuotasSearchParams {
  country?: string
  region?: string
  dimensionType?: string
  dimensionValue?: string
}

export default async function QuotasPage({
  searchParams,
}: {
  searchParams: Promise<QuotasSearchParams>
}) {
  const params = await searchParams
  const [items, regionCaps] = await Promise.all([
    listQuotaProgress({
      country: params.country || undefined,
      region: params.region || undefined,
      dimensionType: params.dimensionType || undefined,
      dimensionValue: params.dimensionValue || undefined,
    }),
    listRegionCaps(),
  ])
  const catalogCountries = listSupportedCountries()
  const regionsByCountry = Object.fromEntries(
    catalogCountries.map((c) => [c, [...listNseRegionsForSupportedCountry(c)]]),
  )
  const nseLevelsByCountry = Object.fromEntries(
    catalogCountries.map((c) => [c, [...getCountryConfig(c).nseLevels]]),
  )

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

  const hasActiveFilters = Boolean(
    params.country || params.region || params.dimensionType || params.dimensionValue,
  )

  const sorted = [...items].sort(
    (a, b) =>
      a.country.localeCompare(b.country) ||
      a.region.localeCompare(b.region) ||
      a.dimensionType.localeCompare(b.dimensionType) ||
      a.dimensionValue.localeCompare(b.dimensionValue),
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PanelSmart</p>
          <h1 className={styles.title}>Cuotas</h1>
          <p className={styles.sub}>
            Objetivos de leads por país, región y dimensión (NSE, edad o integrantes). Un lead califica
            si cumple al menos una dimensión con cupo disponible en su región — ver{' '}
            <a href="#region-caps">tope agregado por región</a> más abajo.
          </p>
        </div>
        <div className={styles.headerActions}>
          <ImportForm />
          <a href="/api/admin/quotas/export" className={styles.exportLink}>
            Exportar
          </a>
        </div>
      </header>

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

      <QuotaFiltersForm
        countries={catalogCountries}
        regionsByCountry={regionsByCountry}
        nseLevelsByCountry={nseLevelsByCountry}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>País</th>
              <th>Región</th>
              <th>Dimensión</th>
              <th>Valor</th>
              <th>Objetivo</th>
              <th>Conseguidos</th>
              <th>Disponibles</th>
              <th>% Avance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <NewQuotaTargetRow
              countries={catalogCountries}
              regionsByCountry={regionsByCountry}
              nseLevelsByCountry={nseLevelsByCountry}
            />
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  {hasActiveFilters
                    ? 'Ninguna cuota coincide con los filtros actuales.'
                    : 'Aún no hay cuotas configuradas. Importa el Excel de Kantar o crea una manualmente.'}
                </td>
              </tr>
            ) : (
              sorted.map((item) => <QuotaRowForm key={item.id} item={item} />)
            )}
          </tbody>
        </table>
      </div>

      <section id="region-caps" className={styles.regionCapsSection}>
        <h2 className={styles.title}>Tope agregado por región</h2>
        <p className={styles.sub}>
          Límite manual de leads calificados por región, independiente de las dimensiones — evita
          concentrar el reclutamiento en una sola región. Los leads calificados por embarazo/bebé
          cuentan en el total pero nunca son bloqueados por este tope.
        </p>
        <RegionCapForm caps={regionCaps} countries={catalogCountries} regionsByCountry={regionsByCountry} />
      </section>
    </div>
  )
}
