import { listQuotaProgress } from '@/lib/quotas/quota-progress'
import { listRegionCaps, listRegionObjectives } from '@/lib/quotas/region-caps'
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
  const [items, regionCaps, regionObjectives] = await Promise.all([
    listQuotaProgress({
      country: params.country || undefined,
      region: params.region || undefined,
      dimensionType: params.dimensionType || undefined,
      dimensionValue: params.dimensionValue || undefined,
    }),
    listRegionCaps(),
    listRegionObjectives(),
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
            El <strong>objetivo por país + región</strong> (columna 1 del cliente) es el techo duro:
            al alcanzarlo, todos los leads nuevos de esa región pasan a &ldquo;cuota agotada&rdquo;,
            incluidos embarazo/bebé y los que aplican por edad/integrantes. Las líneas por NSE son el
            desglose dentro de ese techo. Ver{' '}
            <a href="#region-status">estado de cuota por región</a> más abajo.
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

      <section id="region-status" className={styles.regionCapsSection}>
        <h2 className={styles.title}>Estado de cuota por región</h2>
        <p className={styles.sub}>
          Objetivo efectivo por región = objetivo manual si está cargado, si no la suma de las
          líneas NSE activas. Una región sin objetivo queda <strong>cerrada</strong> (no califica
          nadie). Al llegar a <strong>COMPLETA</strong> la región deja de recibir leads.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>País</th>
                <th>Región</th>
                <th>Objetivo</th>
                <th>Fuente</th>
                <th>Conseguidos</th>
                <th>Disponibles</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {regionObjectives.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Aún no hay regiones con cuota configurada.
                  </td>
                </tr>
              ) : (
                regionObjectives.map((r) => (
                  <tr key={`${r.country}|${r.region}`}>
                    <td>{r.country}</td>
                    <td>{r.region}</td>
                    <td>{r.objective}</td>
                    <td>
                      {r.source === 'cap'
                        ? 'manual'
                        : r.source === 'nse_sum'
                          ? 'Σ NSE'
                          : '— sin config'}
                      {r.mismatch ? ` ⚠️ Σ NSE = ${r.nseSum}` : ''}
                    </td>
                    <td>{r.achieved}</td>
                    <td>{r.available}</td>
                    <td>
                      {r.objective <= 0
                        ? 'CERRADA'
                        : r.complete
                          ? 'COMPLETA'
                          : `${Math.round((r.achieved / r.objective) * 100)}%`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="region-caps" className={styles.regionCapsSection}>
        <h2 className={styles.title}>Objetivo manual por región</h2>
        <p className={styles.sub}>
          Cargá acá el número de panelistas que pide el cliente para cada región (columna 1 de la
          muestra). Si se deja vacío, el objetivo se deriva de la suma de las líneas NSE. Este
          número es el techo duro para todos los condicionales.
        </p>
        <RegionCapForm caps={regionCaps} countries={catalogCountries} regionsByCountry={regionsByCountry} />
      </section>
    </div>
  )
}
