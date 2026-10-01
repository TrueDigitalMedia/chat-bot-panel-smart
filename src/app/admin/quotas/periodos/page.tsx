import Link from 'next/link'
import { listQuotaPeriodsWithProgress } from '@/lib/quotas/quota-cuts'
import { listSupportedCountries } from '@/lib/countries/registry'
import { OpenPeriodForm } from './open-period-form'
import { PeriodActions } from './period-actions'
import styles from './periodos.module.css'

export default async function QuotaPeriodsPage() {
  const periods = await listQuotaPeriodsWithProgress()
  const countries = listSupportedCountries()

  // Países sin periodo abierto: cerrados de hecho. Se listan explícitamente en vez de omitirse,
  // porque un país muerto que no aparece en ninguna tabla es invisible (spec 018 §6a).
  const countriesWithOpen = new Set(periods.filter((p) => p.status === 'open').map((p) => p.country))
  const countriesWithoutOpen = countries.filter((c) => !countriesWithOpen.has(c))

  // Abiertos arriba; dentro de cada grupo, por país y por fecha de inicio descendente.
  const sorted = [...periods].sort(
    (a, b) =>
      Number(b.status === 'open') - Number(a.status === 'open') ||
      a.country.localeCompare(b.country) ||
      b.startsOn.localeCompare(a.startsOn),
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PanelSmart</p>
          <h1 className={styles.title}>Periodos y cortes de cuota</h1>
          <p className={styles.sub}>
            Las cuotas y los conseguidos viven dentro de un periodo (Q1–Q4) por país. Al{' '}
            <strong>cerrar el corte</strong> se congelan objetivo, conseguidos, faltante y % de ese
            periodo, y el país deja de recibir leads nuevos hasta que se abra el siguiente. Las fechas
            son informativas: cada lead cuenta en el periodo con el que fue sellado al calificar, no
            por su fecha de alta.
          </p>
        </div>
        <Link href="/admin/quotas" className={styles.backLink}>
          ← Cuotas
        </Link>
      </header>

      {countriesWithoutOpen.length > 0 ? (
        <p className={styles.alertBanner}>
          <strong>Sin periodo abierto:</strong> {countriesWithoutOpen.join(', ')}. Ningún lead nuevo
          de esos países califica — ni por excepción de embarazo o bebé.
        </p>
      ) : null}

      <OpenPeriodForm countries={countries} />

      <p className={styles.sub}>
        Un periodo nuevo arranca <strong>vacío</strong>: cargá los objetivos a mano en{' '}
        <Link href="/admin/quotas">Cuotas</Link> o importando el Excel. Hasta que haya líneas
        cargadas, todas las regiones de ese país leen CERRADA.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>País</th>
              <th>Periodo</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Estado</th>
              <th>Objetivo</th>
              <th>Conseguidos</th>
              <th>Faltante</th>
              <th>%</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className={styles.empty}>
                  Todavía no hay periodos. Abrí el primero con el formulario de arriba.
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr key={p.id}>
                  <td>{p.country}</td>
                  <td>
                    <Link href={`/admin/quotas/periodos/${p.id}`}>{p.label}</Link>
                  </td>
                  <td>{p.startsOn}</td>
                  <td>{p.endsOn}</td>
                  <td>
                    <span className={p.status === 'open' ? styles.badgeOpen : styles.badgeClosed}>
                      {p.status === 'open' ? 'ABIERTO' : 'CERRADO'}
                    </span>
                  </td>
                  <td>{p.objective}</td>
                  <td>{p.achieved}</td>
                  <td>{p.missing}</td>
                  <td>
                    {p.progressPct}%{p.preliminary ? <span className={styles.muted}> (prelim.)</span> : null}
                  </td>
                  <td>
                    <PeriodActions
                      periodId={p.id}
                      label={p.label}
                      country={p.country}
                      status={p.status}
                      objective={p.objective}
                      achieved={p.achieved}
                      missing={p.missing}
                      progressPct={p.progressPct}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
