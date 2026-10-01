import Link from 'next/link'
import { listQuotaProgress } from '@/lib/quotas/quota-progress'
import { listRegionCaps, listRegionObjectives } from '@/lib/quotas/region-caps'
import { listQuotaPeriods, getQuotaPeriod } from '@/lib/quotas/quota-periods'
import { listSupportedCountries, listNseRegionsForSupportedCountry, getCountryConfig } from '@/lib/countries/registry'
import { QuotaRowForm } from './quota-row-form'
import { NewQuotaTargetRow } from './new-quota-target-row'
import { ImportForm } from './import-form'
import { RegionCapForm } from './region-cap-form'
import { QuotaFiltersForm } from './quota-filters-form'
import styles from './quotas.module.css'

interface QuotasSearchParams {
  periodId?: string
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
  const periodId = params.periodId || undefined
  const [items, regionCaps, regionObjectives, allPeriods, selectedPeriod] = await Promise.all([
    listQuotaProgress({
      periodId,
      country: params.country || undefined,
      region: params.region || undefined,
      dimensionType: params.dimensionType || undefined,
      dimensionValue: params.dimensionValue || undefined,
    }),
    listRegionCaps({ periodId, country: params.country || undefined }),
    listRegionObjectives({ periodId, country: params.country || undefined }),
    listQuotaPeriods(),
    periodId ? getQuotaPeriod(periodId) : Promise.resolve(null),
  ])

  // Un periodo cerrado se mira, no se edita: la API responde 409 ('period_closed') igualmente,
  // pero dejar los inputs vivos solo serviría para que el operador se coma el error.
  const readOnly = selectedPeriod?.status === 'closed'
  const openPeriods = allPeriods.filter((p) => p.status === 'open')
  const openPeriodIdByCountry = Object.fromEntries(openPeriods.map((p) => [p.country, p.id]))
  const periodOptions = allPeriods.map((p) => ({
    id: p.id,
    country: p.country,
    label: p.label,
    status: p.status,
  }))

  const catalogCountries = listSupportedCountries()
  // Un país sin periodo abierto está CERRADO: no califica ningún lead nuevo. Sin este aviso se ve
  // exactamente igual que un día normal, y el único síntoma serían leads apilándose en
  // "cuota agotada" (spec 018 §6a).
  const countriesWithoutOpenPeriod = catalogCountries.filter((c) => !openPeriodIdByCountry[c])
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
          <Link href="/admin/quotas/periodos" className={styles.exportLink}>
            Periodos y cortes
          </Link>
          {readOnly ? null : <ImportForm periodId={periodId} />}
          <a
            href={`/api/admin/quotas/export${periodId ? `?periodId=${periodId}` : ''}`}
            className={styles.exportLink}
          >
            Exportar
          </a>
        </div>
      </header>

      {countriesWithoutOpenPeriod.length > 0 ? (
        <p className={styles.alertBanner}>
          <strong>Sin periodo abierto:</strong> {countriesWithoutOpenPeriod.join(', ')}. Ningún lead
          nuevo de esos países califica hasta que se abra un periodo en{' '}
          <Link href="/admin/quotas/periodos">Periodos y cortes</Link>.
        </p>
      ) : null}

      {selectedPeriod ? (
        <p className={readOnly ? styles.alertBanner : styles.infoBanner}>
          Mostrando <strong>{selectedPeriod.country} · {selectedPeriod.label}</strong> (
          {selectedPeriod.startsOn} → {selectedPeriod.endsOn}){' '}
          {readOnly ? '— periodo CERRADO, solo lectura.' : '— periodo abierto.'}{' '}
          <Link href={`/admin/quotas/periodos/${selectedPeriod.id}`}>Ver el corte</Link>
        </p>
      ) : (
        <p className={styles.infoBanner}>
          Mostrando los <strong>periodos abiertos</strong>
          {openPeriods.length > 0
            ? `: ${openPeriods.map((p) => `${p.country} ${p.label}`).join(' · ')}`
            : ' (no hay ninguno)'}
          . Las fechas del periodo son informativas: los conseguidos se cuentan por el periodo con
          el que se selló cada lead al calificar, no por su fecha de alta.
        </p>
      )}

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
        periods={periodOptions}
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
            {readOnly ? null : (
              <NewQuotaTargetRow
                countries={catalogCountries}
                regionsByCountry={regionsByCountry}
                nseLevelsByCountry={nseLevelsByCountry}
                openPeriodIdByCountry={openPeriodIdByCountry}
              />
            )}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.empty}>
                  {hasActiveFilters
                    ? 'Ninguna cuota coincide con los filtros actuales.'
                    : 'Aún no hay cuotas configuradas. Importa el Excel de Kantar o crea una manualmente.'}
                </td>
              </tr>
            ) : (
              sorted.map((item) => <QuotaRowForm key={item.id} item={item} readOnly={readOnly} />)
            )}
          </tbody>
        </table>
      </div>

      <section id="region-status" className={styles.regionCapsSection}>
        <h2 className={styles.title}>Estado de cuota por región</h2>
        <p className={styles.sub}>
          Objetivo efectivo por región = objetivo manual si está cargado, si no la suma de las
          líneas NSE activas. Una región sin objetivo queda <strong>cerrada</strong> (no califica
          nadie). Al llegar a <strong>COMPLETA</strong> la región deja de recibir leads. Son dos
          gestos distintos: <em>desactivar las líneas</em> cierra una región, <em>cerrar el
          periodo</em> cierra el país entero. Un periodo recién abierto todavía no tiene líneas, así
          que todas sus regiones leen CERRADA hasta que se carguen los objetivos.
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
                      {r.deactivated
                        ? `desactivada${r.capCount != null ? ` (tope manual ${r.capCount} ignorado)` : ''}`
                        : r.source === 'cap'
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
        <RegionCapForm
          caps={regionCaps}
          countries={catalogCountries}
          regionsByCountry={regionsByCountry}
          openPeriodIdByCountry={openPeriodIdByCountry}
          readOnly={readOnly}
        />
      </section>
    </div>
  )
}
