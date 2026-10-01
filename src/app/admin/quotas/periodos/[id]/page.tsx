import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPeriodCut } from '@/lib/quotas/quota-cuts'
import { QuotaPeriodNotFoundError } from '@/lib/quotas/quota-periods'
import { PeriodActions } from '../period-actions'
import styles from '../periodos.module.css'

const SOURCE_LABELS: Record<string, string> = {
  cap: 'manual',
  nse_sum: 'Σ NSE',
  none: '— sin config',
}

export default async function QuotaPeriodCutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const cut = await getPeriodCut(id).catch((err) => {
    if (err instanceof QuotaPeriodNotFoundError) return null
    throw err
  })
  if (!cut) notFound()

  const { period, totals, regions, cells, preliminary } = cut

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Corte de cuota</p>
          <h1 className={styles.title}>
            {period.country} · {period.label}
          </h1>
          <p className={styles.sub}>
            {period.startsOn} → {period.endsOn} ·{' '}
            <span className={period.status === 'open' ? styles.badgeOpen : styles.badgeClosed}>
              {period.status === 'open' ? 'ABIERTO' : 'CERRADO'}
            </span>
            {period.closedAt ? ` · cerrado el ${period.closedAt.toISOString().slice(0, 10)}` : ''}
          </p>
        </div>
        <div className={styles.rowActions}>
          <a href={`/api/admin/quotas/periods/${period.id}/leads?format=csv`} className={styles.backLink}>
            Descargar leads del corte (CSV)
          </a>
          <Link href="/admin/quotas/periodos" className={styles.backLink}>
            ← Periodos
          </Link>
        </div>
      </header>

      {preliminary ? (
        <p className={styles.infoBanner}>
          <strong>Corte preliminar:</strong> el periodo sigue abierto, así que estas cifras se
          calculan en vivo y todavía se mueven. Se congelan al cerrar el corte.
        </p>
      ) : (
        <p className={styles.infoBanner}>
          Cifras <strong>congeladas</strong> al momento del cierre. La lista de leads del CSV, en
          cambio, es la actual: un lead puede haber cambiado de estado después del corte.
        </p>
      )}

      <div className={styles.summaryCards}>
        <div className={styles.card}>
          <span>Objetivo</span>
          <strong>{totals.objective}</strong>
        </div>
        <div className={styles.card}>
          <span>Conseguidos</span>
          <strong>{totals.achieved}</strong>
        </div>
        <div className={styles.card}>
          <span>Faltante</span>
          <strong>{totals.missing}</strong>
        </div>
        {totals.excess > 0 ? (
          <div className={styles.card}>
            <span>Excedente</span>
            <strong>+{totals.excess}</strong>
          </div>
        ) : null}
        <div className={styles.card}>
          <span>% Alcanzado</span>
          <strong>{totals.progressPct}%</strong>
        </div>
      </div>

      <PeriodActions
        periodId={period.id}
        label={period.label}
        country={period.country}
        status={period.status}
        objective={totals.objective}
        achieved={totals.achieved}
        missing={totals.missing}
        progressPct={totals.progressPct}
      />

      <section className={styles.section}>
        <h2 className={styles.title}>Por región</h2>
        <p className={styles.sub}>
          El objetivo por región es el techo duro del periodo: incluye a los leads que calificaron por
          excepción de embarazo o bebé menor a 36 meses. Los totales de arriba se suman sobre estas
          filas. El <strong>faltante</strong> es la suma de los déficits de cada región: un excedente
          en una región no compensa el faltante de otra, así que conseguidos + faltante puede superar
          al objetivo. Esa diferencia es el <strong>excedente</strong>.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Región</th>
                <th>Objetivo</th>
                <th>Fuente</th>
                <th>Conseguidos</th>
                <th>Faltante</th>
                <th>%</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {regions.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Este periodo no tiene ninguna región con cuota configurada.
                  </td>
                </tr>
              ) : (
                regions.map((r) => (
                  <tr key={`${r.country}|${r.region}`}>
                    <td>
                      {r.region === '' ? (
                        <span className={styles.muted}>
                          Sin región asignada — leads sin región resuelta en su encuesta
                        </span>
                      ) : (
                        r.region
                      )}
                    </td>
                    <td>{r.objective}</td>
                    <td>{r.deactivated ? 'desactivada' : (SOURCE_LABELS[r.source ?? 'none'] ?? r.source)}</td>
                    <td>{r.achieved}</td>
                    <td>{r.missing}</td>
                    <td>{r.progressPct}%</td>
                    <td>
                      {r.objective <= 0 ? 'CERRADA' : r.missing === 0 ? 'COMPLETA' : `${r.progressPct}%`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Por línea de cuota</h2>
        <p className={styles.sub}>
          La suma de estas líneas <strong>no</strong> tiene por qué igualar el total por región: los
          leads que entran por la excepción de embarazo o bebé cuentan en su región y en ninguna línea
          NSE.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Región</th>
                <th>Dimensión</th>
                <th>Valor</th>
                <th>Objetivo</th>
                <th>Conseguidos</th>
                <th>Faltante</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {cells.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Este periodo no tiene líneas de cuota cargadas.
                  </td>
                </tr>
              ) : (
                cells.map((c) => (
                  <tr key={`${c.region}|${c.dimensionType}|${c.dimensionValue}`}>
                    <td>{c.region}</td>
                    <td>{c.dimensionType}</td>
                    <td>{c.dimensionValue}</td>
                    <td>{c.objective}</td>
                    <td>{c.achieved}</td>
                    <td>{c.missing}</td>
                    <td>
                      {c.progressPct}%{c.deactivated ? <span className={styles.muted}> (inactiva)</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
