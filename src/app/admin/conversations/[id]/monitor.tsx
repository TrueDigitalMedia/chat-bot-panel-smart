'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import styles from '../conversations.module.css'
import { DeleteConversationButton } from '../delete-conversation-button'

type Message = {
  id: string
  direction: 'in' | 'out'
  contentType: string
  body: string
  meta: Record<string, unknown> | null
  createdAt: string
}

type LeadDetail = {
  id: string
  channel: string
  channelUserId: string
  channelUsername: string | null
  phoneNumber: string | null
  leadStatus: string
  statusReason: string | null
  currentPhase: number
  surveyQuestionIndex: number
  score: number | null
  quotaSegment: string | null
  conversationSummary: string | null
  d1Accepted: boolean
  d3IsShopper: boolean | null
  lastActivityAt: string
  fullName: string | null
  country: string | null
  stateProvince: string | null
  municipality: string | null
  neighborhood: string | null
  nseRegion: string | null
  geoSource: string | null
  inQuotaGeo: boolean | null
  email: string | null
  gender: string | null
  panelSmartSyncStatus: string | null
  panelSmartLastSyncAt: string | null
  panelSmartSyncedAnswersJson: Record<string, unknown> | null
}

type PanelSmartPreview = {
  status: 'disabled' | 'not_found' | 'nothing_pending' | 'ok'
  payload: { lead_id: string; responses: { codigo_pregunta: string; pregunta: string; respuesta: string }[] } | null
  fieldNames: string[]
}

type EvalDetail = {
  id: string
  overallScore: number
  passed: boolean
  checks: Record<string, boolean>
  mismatches: Array<{ field: string; expected: unknown; actual: unknown }>
  reason: string
  expected: Record<string, unknown>
  actual: Record<string, unknown>
  ranAt: string
  evalVersion: string
  fixtureId: string | null
}

function formatWhen(d: string): string {
  return new Date(d).toLocaleString('es-GT', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

export function ConversationMonitor({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [evalResult, setEvalResult] = useState<EvalDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [evalBusy, setEvalBusy] = useState(false)
  const [evalMsg, setEvalMsg] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<PanelSmartPreview | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [replyInput, setReplyInput] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${leadId}`, { cache: 'no-store' })
      if (!res.ok) {
        setError(res.status === 404 ? 'Conversación no encontrada' : 'Error al cargar')
        return
      }
      const data = (await res.json()) as {
        lead: LeadDetail
        messages: Message[]
        eval: EvalDetail | null
      }
      setLead(data.lead)
      setMessages(data.messages)
      setEvalResult(data.eval ?? null)
      setError(null)
    } catch {
      setError('No se pudo conectar')
    }
  }, [leadId])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 3000)
    return () => clearInterval(id)
  }, [load])

  const sendReply = useCallback(
    async (payload: { text: string } | { callbackData: string; label: string }) => {
      if (replySending) return
      setReplySending(true)
      setReplyError(null)
      try {
        const res = await fetch(`/api/conversations/${leadId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { message?: string } | null
          setReplyError(data?.message || 'No se pudo enviar la respuesta')
          return
        }
        await load()
      } catch {
        setReplyError('No se pudo conectar')
      } finally {
        setReplySending(false)
      }
    },
    [leadId, load, replySending],
  )

  function handleSendText(e: FormEvent): void {
    e.preventDefault()
    const text = replyInput.trim()
    if (!text || replySending) return
    setReplyInput('')
    void sendReply({ text })
  }

  useEffect(() => {
    if (messages.length > prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevCount.current = messages.length
  }, [messages.length])

  if (error && !lead) {
    return <p className={styles.threadEmpty}>{error}</p>
  }

  if (!lead) {
    return <p className={styles.threadEmpty}>Cargando…</p>
  }

  return (
    <div className={styles.detailGrid}>
      <aside className={styles.sideCard}>
        <h2>{lead.fullName || lead.channelUsername || 'Lead'}</h2>
        <ul className={styles.metaList}>
          <li>
            <span>Estado</span>
            <strong>{lead.leadStatus}</strong>
          </li>
          {lead.statusReason ? (
            <li>
              <span>Razón</span>
              <strong>{lead.statusReason}</strong>
            </li>
          ) : null}
          <li>
            <span>Canal</span>
            <strong>
              {lead.channel} · {lead.channelUserId}
            </strong>
          </li>
          <li>
            <span>Teléfono</span>
            <strong>{lead.phoneNumber || '—'}</strong>
          </li>
          <li>
            <span>Progreso</span>
            <strong>
              Fase {lead.currentPhase} · Pregunta {lead.surveyQuestionIndex}
            </strong>
          </li>
          <li>
            <span>Ubicación</span>
            <strong>
              {[lead.neighborhood, lead.municipality, lead.stateProvince, lead.country]
                .filter(Boolean)
                .join(', ') || '—'}
            </strong>
          </li>
          <li>
            <span>Región NSE</span>
            <strong>{lead.nseRegion || '—'}</strong>
          </li>
          <li>
            <span>Fuente GEO</span>
            <strong>{lead.geoSource || '—'}</strong>
          </li>
          <li>
            <span>Cupo geo</span>
            <strong>
              {lead.inQuotaGeo === true ? 'Sí' : lead.inQuotaGeo === false ? 'No' : '—'}
            </strong>
          </li>
          <li>
            <span>Email</span>
            <strong>{lead.email || '—'}</strong>
          </li>
          <li>
            <span>Score NSE / cupo</span>
            <strong>
              {lead.score ?? '—'}
              {lead.quotaSegment ? ` · ${lead.quotaSegment}` : ''}
            </strong>
          </li>
          <li>
            <span>Eval QA</span>
            <strong>
              {evalResult
                ? `${evalResult.overallScore} · ${evalResult.passed ? 'pass' : 'fail'}`
                : '—'}
            </strong>
          </li>
          <li>
            <span>Panel Smart Sync</span>
            <strong>
              {lead.panelSmartSyncStatus ? (
                <span style={{ color: lead.panelSmartSyncStatus === 'synced' ? '#10b981' : '#ef4444' }}>
                  {lead.panelSmartSyncStatus}
                </span>
              ) : (
                '—'
              )}
            </strong>
            <button
              type="button"
              className={styles.evalBtn}
              style={{ marginTop: '0.35rem' }}
              disabled={previewBusy}
              onClick={async () => {
                setPreviewBusy(true)
                setPreview(null)
                try {
                  const res = await fetch('/api/admin/panel-smart-sync/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId }),
                  })
                  if (!res.ok) {
                    setPreview({ status: 'not_found', payload: null, fieldNames: [] })
                  } else {
                    setPreview((await res.json()) as PanelSmartPreview)
                  }
                } catch {
                  setPreview({ status: 'not_found', payload: null, fieldNames: [] })
                } finally {
                  setPreviewBusy(false)
                }
              }}
            >
              {previewBusy ? 'Consultando…' : 'Sincronizar a TDM'}
            </button>
            {preview && preview.status === 'disabled' ? (
              <div className={styles.muted}>Sincronización a Panel Smart deshabilitada.</div>
            ) : null}
            {preview && preview.status === 'not_found' ? (
              <div className={styles.muted}>No se pudo obtener la vista previa.</div>
            ) : null}
            {preview && preview.status === 'nothing_pending' ? (
              <div className={styles.muted}>No hay respuestas para sincronizar.</div>
            ) : null}
            {preview && preview.status === 'ok' && preview.payload ? (
              <div className={styles.evalBox} style={{ marginTop: '0.5rem' }}>
                <p className={styles.muted}>
                  {preview.fieldNames.length} campo(s) a sincronizar: {preview.fieldNames.join(', ')}
                </p>
                <pre className={styles.evalMismatches}>{JSON.stringify(preview.payload, null, 2)}</pre>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className={styles.evalBtn}
                    disabled={confirmBusy}
                    onClick={async () => {
                      setConfirmBusy(true)
                      try {
                        const res = await fetch('/api/admin/panel-smart-sync/run', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ leadId }),
                        })
                        if (res.ok) {
                          setPreview(null)
                          await load()
                        }
                      } finally {
                        setConfirmBusy(false)
                      }
                    }}
                  >
                    {confirmBusy ? 'Enviando…' : 'Confirmar y enviar'}
                  </button>
                  <button type="button" className={styles.evalBtn} disabled={confirmBusy} onClick={() => setPreview(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </li>
          {lead.panelSmartLastSyncAt && (
            <li>
              <span>Última sincronización</span>
              <strong>{formatWhen(lead.panelSmartLastSyncAt)}</strong>
            </li>
          )}
          <li>
            <span>Última actividad</span>
            <strong>{formatWhen(lead.lastActivityAt)}</strong>
          </li>
        </ul>
        {lead.panelSmartSyncStatus && (
          <div className={styles.evalBox} style={{ marginTop: '1rem' }}>
            <strong>Panel Smart Respuestas Sincronizadas</strong>
            {lead.panelSmartSyncedAnswersJson && Object.keys(lead.panelSmartSyncedAnswersJson).length > 0 ? (
              <ul style={{ fontSize: '0.875rem', lineHeight: '1.5', marginTop: '0.5rem' }}>
                {Object.entries(lead.panelSmartSyncedAnswersJson).map(([field, value]) => (
                  <li key={field} style={{ padding: '0.25rem 0' }}>
                    <span style={{ color: '#6b7280' }}>{field}:</span> {String(value).substring(0, 50)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Sin respuestas sincronizadas</p>
            )}
          </div>
        )}
        <div className={styles.evalBox}>
          <strong>Eval calificación / cuota</strong>
          <button
            type="button"
            className={styles.evalBtn}
            disabled={evalBusy}
            onClick={async () => {
              setEvalBusy(true)
              setEvalMsg(null)
              try {
                const res = await fetch(`/api/conversations/${leadId}/eval`, {
                  method: 'POST',
                })
                const data = (await res.json()) as {
                  error?: string
                  skipReason?: string
                  overallScore?: number
                  passed?: boolean
                  eval?: EvalDetail | null
                }
                if (!res.ok) {
                  setEvalMsg(data.skipReason || data.error || 'No evaluable')
                } else {
                  setEvalResult(data.eval ?? null)
                  setEvalMsg(
                    `OK · ${data.overallScore} · ${data.passed ? 'pass' : 'fail'}`,
                  )
                  await load()
                }
              } catch {
                setEvalMsg('Error al ejecutar eval')
              } finally {
                setEvalBusy(false)
              }
            }}
          >
            {evalBusy ? 'Evaluando…' : evalResult ? 'Re-ejecutar eval' : 'Ejecutar eval'}
          </button>
          {evalMsg ? <p className={styles.muted}>{evalMsg}</p> : null}
          {evalResult ? (
            <>
              <p className={styles.muted}>
                reason: {evalResult.reason} · v{evalResult.evalVersion} ·{' '}
                {evalResult.overallScore} ({evalResult.passed ? 'pass' : 'fail'})
              </p>
              <ul className={styles.evalChecks}>
                {Object.entries(evalResult.checks).map(([key, ok]) => (
                  <li key={key} className={ok ? styles.evalOk : styles.evalFail}>
                    {ok ? '✓' : '✗'} {key}
                  </li>
                ))}
              </ul>
              {evalResult.mismatches?.length > 0 ? (
                <pre className={styles.evalMismatches}>
                  {JSON.stringify(evalResult.mismatches, null, 2)}
                </pre>
              ) : null}
            </>
          ) : (
            <p className={styles.muted}>Sin eval aún. Ejecuta para calificar este lead.</p>
          )}
        </div>
        {lead.conversationSummary ? (
          <p className={styles.summary}>
            <strong>Resumen AI: </strong>
            {lead.conversationSummary}
          </p>
        ) : null}
      </aside>

      <section className={styles.threadCard}>
        <div className={styles.threadHead}>
          <strong>Timeline</strong>
          <span className={styles.live}>
            <span className={styles.dot} aria-hidden />
            Actualiza cada 3s
          </span>
          <DeleteConversationButton leadId={leadId} redirectTo="/admin/conversations" />
        </div>
        <div className={styles.thread}>
          {messages.length === 0 ? (
            <p className={styles.threadEmpty}>
              Sin mensajes registrados aún. Los nuevos (in/out) aparecerán aquí al conversar.
            </p>
          ) : (
            messages.map((m) => {
              const isOut = m.direction === 'out'
              const buttons = Array.isArray(m.meta?.buttons)
                ? (m.meta!.buttons as { text: string; callback_data: string }[])
                : null
              const buttonsClickable = isOut && lead.channel === 'web'
              // A button click's raw callback_data (e.g. "optin:accept") isn't meant for
              // display — prefer the friendly label stored in meta, same as /chat (spec 012).
              const displayBody =
                m.contentType === 'callback' ? ((m.meta?.label as string | undefined) ?? m.body) : m.body
              return (
                <div
                  key={m.id}
                  className={`${styles.bubble} ${isOut ? styles.bubbleOut : styles.bubbleIn}`}
                >
                  <div>{displayBody}</div>
                  {buttons && buttons.length > 0 ? (
                    <div className={styles.buttons}>
                      {buttons.map((b, i) =>
                        buttonsClickable ? (
                          <button
                            key={`${m.id}-b-${i}`}
                            type="button"
                            className={styles.chipBtn}
                            disabled={replySending}
                            onClick={() => void sendReply({ callbackData: b.callback_data, label: b.text })}
                          >
                            {b.text}
                          </button>
                        ) : (
                          <span key={`${m.id}-b-${i}`} className={styles.chip}>
                            {b.text}
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}
                  <span className={styles.bubbleMeta}>
                    {isOut ? 'bot' : 'usuario'} · {m.contentType} · {formatWhen(m.createdAt)}
                  </span>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
        {replyError ? <p className={styles.replyDisabledNote}>{replyError}</p> : null}
        {lead.channel === 'web' ? (
          <form onSubmit={handleSendText} className={styles.replyBar}>
            <input
              className={styles.replyInput}
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              placeholder="Responder como el visitante…"
              disabled={replySending}
            />
            <button type="submit" className={styles.replySendBtn} disabled={replySending || !replyInput.trim()}>
              {replySending ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        ) : (
          <p className={styles.replyDisabledNote}>
            Responder solo está disponible para conversaciones del canal web — en Telegram/WhatsApp
            enviaría un mensaje real a la persona.
          </p>
        )}
      </section>
    </div>
  )
}
