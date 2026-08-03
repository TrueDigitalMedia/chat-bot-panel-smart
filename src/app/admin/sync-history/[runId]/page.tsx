import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSyncRunWithAttempts } from '@/lib/panel-smart/history'
import type { PanelSmartSyncTrigger } from '@/lib/panel-smart/sync'
import styles from '../sync-history.module.css'

export const dynamic = 'force-dynamic'

const TRIGGER_LABELS: Record<PanelSmartSyncTrigger, string> = {
  state_transition: 'Transición de estado',
  correction: 'Corrección',
  abandoned_cron: 'Cron de conversaciones abandonadas',
}

function formatWhen(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'medium' })
}

export default async function SyncRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const run = await getSyncRunWithAttempts(runId)
  if (!run) notFound()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/sync-history" className={styles.backLink}>
          ← Historial de sincronización
        </Link>
        <p className={styles.eyebrow}>PanelSmart</p>
        <h1 className={styles.title}>{TRIGGER_LABELS[run.trigger]}</h1>
        <p className={styles.sub}>
          Iniciada {formatWhen(run.startedAt)} · Finalizada {formatWhen(run.finishedAt)} · {run.totalCount}{' '}
          conversaciones escaneadas, {run.syncedCount} sincronizadas, {run.failedCount} fallidas.
        </p>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Conversación</th>
              <th>Estado</th>
              <th>Campos sincronizados</th>
              <th>Error</th>
              <th>Hora</th>
            </tr>
          </thead>
          <tbody>
            {run.attempts.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Esta ejecución no tuvo ningún intento registrado (nada pendiente por sincronizar).
                </td>
              </tr>
            ) : (
              run.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>
                    <Link href={`/admin/conversations/${attempt.leadId}`} className={styles.open}>
                      {attempt.lead.fullName || attempt.lead.channelUsername || attempt.lead.phoneNumber || 'Sin nombre'}
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${attempt.status === 'synced' ? styles.stDone : styles.stEnd}`}>
                      {attempt.status === 'synced' ? 'Sincronizado' : 'Fallido'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.fieldsList}>
                      {attempt.fieldsSynced.map((f) => (
                        <span key={f} className={styles.fieldChip}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={styles.errorCell}>{attempt.error || <span className={styles.muted}>—</span>}</td>
                  <td className={styles.muted}>{formatWhen(attempt.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
