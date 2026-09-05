import Link from 'next/link'
import { listConversations } from '@/lib/db/conversation-messages'
import { BackfillEvalsButton } from './backfill-button'
import { DeleteConversationButton } from './delete-conversation-button'
import styles from './conversations.module.css'
import type { LeadStatus } from '@/types/lead'

// This Server Component queries the DB directly with no dynamic API usage (no
// searchParams, unlike quotas/dashboard), so Next's Full Route Cache would otherwise
// statically render it once at build/deploy time and keep serving that snapshot —
// new leads created afterward silently never appear here (though their detail page
// still works, since it's client-fetched with cache: 'no-store'). Force per-request
// rendering so the list always reflects current data.
export const dynamic = 'force-dynamic'

// Duplicated from types/lead.ts's LeadStatus union rather than importing a runtime
// array from there (which doesn't exist today) — keeps this page's filter dropdown
// self-contained; if LeadStatus ever gains/drops a value, update both.
const ALL_STATUSES: LeadStatus[] = [
  'incomplete',
  'not_qualified',
  'quota_exhausted',
  'link_sent',
  'waiting_for_code',
  'code_delivered_registered',
  'code_delivered_not_registered',
  'code_delivered_no_response',
  'ficha_hogar_completada',
  'ficha_hogar_descartado',
  'abandono',
]

const PAGE_SIZE = 25

interface SearchParams {
  status?: string
  source?: string
  page?: string
}

// spec 016 T021 — filter web leads by which chat room they came from.
const SOURCE_FILTERS = [
  { value: 'web:room:Ecuador', label: 'Sala: Ecuador' },
  { value: 'web:room:México', label: 'Sala: México' },
  { value: 'generic', label: 'Web genérico (sin sala)' },
] as const

function roomLabel(source: string | null): string | null {
  if (!source) return null
  if (source === 'web:room:Ecuador') return 'Sala EC'
  if (source === 'web:room:México') return 'Sala MX'
  return source
}

function isValidStatus(v: string | undefined): v is LeadStatus {
  return !!v && (ALL_STATUSES as string[]).includes(v)
}

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

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const status = isValidStatus(params.status) ? params.status : undefined
  const page = Math.max(1, Number(params.page) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const acquisitionSource = SOURCE_FILTERS.some((f) => f.value === params.source) ? params.source : undefined

  const { items: conversations, hasMore } = await listConversations({
    status,
    acquisitionSource,
    limit: PAGE_SIZE,
    offset,
  })

  function filterHref(next: Partial<SearchParams>): string {
    const merged = { status: params.status, source: params.source, page: params.page, ...next }
    const qs = new URLSearchParams()
    if (merged.status) qs.set('status', merged.status)
    if (merged.source) qs.set('source', merged.source)
    if (merged.page) qs.set('page', merged.page)
    const s = qs.toString()
    return s ? `/admin/conversations?${s}` : '/admin/conversations'
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PanelSmart</p>
          <h1 className={styles.title}>Conversaciones</h1>
          <p className={styles.sub}>Monitorea leads activos por canal. Los mensajes nuevos se registran en vivo.</p>
        </div>
        <div className={styles.headerActions}>
          <BackfillEvalsButton />
        </div>
      </header>

      <form className={styles.filters} method="get">
        <select name="status" defaultValue={status ?? ''} className={styles.filterSelect}>
          <option value="">Todos los estados</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={acquisitionSource ?? ''} className={styles.filterSelect}>
          <option value="">Todos los orígenes</option>
          {SOURCE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.filterSubmit}>
          Filtrar
        </button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Canal</th>
              <th>Estado</th>
              <th>Eval QA</th>
              <th>Último mensaje</th>
              <th>Actividad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
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
                    {roomLabel(c.acquisitionSource) ? (
                      <span className={styles.muted}> · {roomLabel(c.acquisitionSource)}</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${statusClass(c.leadStatus)}`}>
                      {c.leadStatus}
                    </span>
                    {c.statusReason ? <div className={styles.muted}>{c.statusReason}</div> : null}
                    <div className={styles.muted}>
                      F{c.currentPhase} · Q{c.surveyQuestionIndex}
                      {c.messageCount ? ` · ${c.messageCount} msgs` : ''}
                    </div>
                  </td>
                  <td>
                    {c.evalScore != null ? (
                      <>
                        <span
                          className={`${styles.badge} ${c.evalPassed ? styles.stDone : styles.stEnd}`}
                        >
                          {c.evalScore}
                        </span>
                        <div className={styles.muted}>{c.evalPassed ? 'pass' : 'fail'}</div>
                      </>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.preview}>
                    {c.lastMessage ? c.lastMessage.slice(0, 80) : '—'}
                  </td>
                  <td className={styles.muted}>{formatWhen(c.lastActivityAt)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <Link href={`/admin/conversations/${c.id}`} className={styles.open}>
                        Abrir
                      </Link>
                      <DeleteConversationButton leadId={c.id} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        {page > 1 ? (
          <Link href={filterHref({ page: String(page - 1) })} className={styles.pageBtn}>
            ← Anterior
          </Link>
        ) : (
          <span className={styles.pageBtnDisabled}>← Anterior</span>
        )}
        <span className={styles.pageIndicator}>Página {page}</span>
        {hasMore ? (
          <Link href={filterHref({ page: String(page + 1) })} className={styles.pageBtn}>
            Siguiente →
          </Link>
        ) : (
          <span className={styles.pageBtnDisabled}>Siguiente →</span>
        )}
      </div>
    </div>
  )
}
