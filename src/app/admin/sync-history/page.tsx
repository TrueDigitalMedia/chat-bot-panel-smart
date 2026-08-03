import Link from 'next/link'
import { listSyncRuns } from '@/lib/panel-smart/history'
import type { PanelSmartSyncTrigger } from '@/lib/panel-smart/sync'
import styles from './sync-history.module.css'

// Server component with no dynamic API usage otherwise — force per-request rendering so
// a run created a minute ago always shows up (same rationale as conversations/page.tsx).
export const dynamic = 'force-dynamic'

const TRIGGER_LABELS: Record<PanelSmartSyncTrigger, string> = {
  state_transition: 'Transición',
  correction: 'Corrección',
  abandoned_cron: 'Cron abandono',
}

interface SearchParams {
  trigger?: string
  soloFallos?: string
}

function formatWhen(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'medium' })
}

function isValidTrigger(v: string | undefined): v is PanelSmartSyncTrigger {
  return v === 'state_transition' || v === 'correction' || v === 'abandoned_cron'
}

export default async function SyncHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const trigger = isValidTrigger(params.trigger) ? params.trigger : undefined
  const onlyFailed = params.soloFallos === '1'

  const runs = await listSyncRuns({ trigger, onlyFailed, limit: 100 })

  function filterHref(next: Partial<SearchParams>): string {
    const merged = { trigger: params.trigger, soloFallos: params.soloFallos, ...next }
    const qs = new URLSearchParams()
    if (merged.trigger) qs.set('trigger', merged.trigger)
    if (merged.soloFallos) qs.set('soloFallos', merged.soloFallos)
    const s = qs.toString()
    return s ? `/admin/sync-history?${s}` : '/admin/sync-history'
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>PanelSmart</p>
        <h1 className={styles.title}>Historial de sincronización</h1>
        <p className={styles.sub}>
          Cada ejecución del envío de respuestas a Kantar/Panel Smart — ya sea disparada por una transición de
          estado, una corrección puntual, o el barrido periódico de conversaciones abandonadas.
        </p>
      </header>

      <nav className={styles.filters}>
        <Link
          href={filterHref({ trigger: undefined })}
          className={`${styles.filterLink} ${!trigger ? styles.filterLinkActive : ''}`}
        >
          Todos
        </Link>
        {(Object.keys(TRIGGER_LABELS) as PanelSmartSyncTrigger[]).map((t) => (
          <Link
            key={t}
            href={filterHref({ trigger: t })}
            className={`${styles.filterLink} ${trigger === t ? styles.filterLinkActive : ''}`}
          >
            {TRIGGER_LABELS[t]}
          </Link>
        ))}
        <Link
          href={filterHref({ soloFallos: onlyFailed ? undefined : '1' })}
          className={`${styles.filterLink} ${onlyFailed ? styles.filterLinkActive : ''}`}
        >
          Solo con fallos
        </Link>
      </nav>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Disparador</th>
              <th>Fecha</th>
              <th>Lead / lote</th>
              <th>Sincronizados</th>
              <th>Fallidos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Aún no hay ejecuciones de sincronización registradas.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <span className={styles.trigger}>{TRIGGER_LABELS[run.trigger]}</span>
                  </td>
                  <td className={styles.muted}>{formatWhen(run.startedAt)}</td>
                  <td>
                    {run.lead ? (
                      <Link href={`/admin/conversations/${run.lead.id}`} className={styles.open}>
                        {run.lead.fullName || run.lead.channelUsername || run.lead.phoneNumber || 'Sin nombre'}
                      </Link>
                    ) : (
                      <span className={styles.muted}>{run.totalCount} conversaciones</span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.stDone}`}>{run.syncedCount}</span>
                  </td>
                  <td>
                    {run.failedCount > 0 ? (
                      <span className={`${styles.badge} ${styles.stEnd}`}>{run.failedCount}</span>
                    ) : (
                      <span className={styles.muted}>0</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/admin/sync-history/${run.id}`} className={styles.open}>
                      Ver detalle
                    </Link>
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
