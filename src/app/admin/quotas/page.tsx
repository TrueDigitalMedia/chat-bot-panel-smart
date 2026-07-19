import Link from 'next/link'
import { listQuotaProgress } from '@/lib/quotas/quota-progress'
import { QuotaRowForm } from './quota-row-form'
import { ImportForm } from './import-form'
import styles from './quotas.module.css'

export default async function QuotasPage() {
  const items = await listQuotaProgress()

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

  const sorted = [...items].sort(
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
          <h1 className={styles.title}>Cuotas</h1>
          <p className={styles.sub}>
            Objetivos de leads por país, región y nivel socioeconómico (CAM). Reemplaza el Excel de
            cuotas.
          </p>
        </div>
        <div className={styles.headerActions}>
          <ImportForm />
          <a href="/api/admin/quotas/export" className={styles.exportLink}>
            Exportar
          </a>
          <Link href="/admin/dashboard" className={styles.homeLink}>
            Dashboard
          </Link>
          <Link href="/" className={styles.homeLink}>
            Inicio
          </Link>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Aún no hay cuotas configuradas. Importa el Excel de Kantar o crea una manualmente.
                </td>
              </tr>
            ) : (
              sorted.map((item) => <QuotaRowForm key={item.id} item={item} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
