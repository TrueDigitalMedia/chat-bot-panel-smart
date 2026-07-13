import Link from 'next/link'
import { listConversations } from '@/lib/db/conversation-messages'
import styles from './conversations.module.css'

function formatWhen(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('es-GT', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function statusClass(status: string): string {
  if (status === 'incomplete') return styles.stIncomplete
  if (status.includes('code') || status === 'link_sent') return styles.stProgress
  if (status === 'ficha_hogar_completada') return styles.stDone
  if (status === 'abandono' || status === 'not_qualified' || status === 'quota_exhausted') {
    return styles.stEnd
  }
  return styles.stIncomplete
}

export default async function ConversationsPage() {
  const conversations = await listConversations(100)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PanelSmart</p>
          <h1 className={styles.title}>Conversaciones</h1>
          <p className={styles.sub}>Monitorea leads activos por canal. Los mensajes nuevos se registran en vivo.</p>
        </div>
        <Link href="/" className={styles.homeLink}>
          Inicio
        </Link>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Canal</th>
              <th>Estado</th>
              <th>Último mensaje</th>
              <th>Actividad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Aún no hay conversaciones.
                </td>
              </tr>
            ) : (
              conversations.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className={styles.user}>
                      <strong>{c.fullName || c.channelUsername || c.phoneNumber || 'Sin nombre'}</strong>
                      <span className={styles.muted}>
                        {c.phoneNumber || c.channelUserId}
                        {c.country ? ` · ${c.country}` : ''}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.channel}>{c.channel}</span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${statusClass(c.leadStatus)}`}>
                      {c.leadStatus}
                    </span>
                    <div className={styles.muted}>
                      F{c.currentPhase} · Q{c.surveyQuestionIndex}
                      {c.messageCount ? ` · ${c.messageCount} msgs` : ''}
                    </div>
                  </td>
                  <td className={styles.preview}>
                    {c.lastMessage ? c.lastMessage.slice(0, 80) : '—'}
                  </td>
                  <td className={styles.muted}>{formatWhen(c.lastActivityAt)}</td>
                  <td>
                    <Link href={`/conversations/${c.id}`} className={styles.open}>
                      Abrir
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
