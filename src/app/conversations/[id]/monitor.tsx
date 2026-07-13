'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from '../conversations.module.css'

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
  currentPhase: number
  surveyQuestionIndex: number
  score: number | null
  quotaSegment: string | null
  conversationSummary: string | null
  d1Accepted: boolean
  d2Accepted: boolean | null
  d3IsShopper: boolean | null
  lastActivityAt: string
  fullName: string | null
  country: string | null
  stateProvince: string | null
  municipality: string | null
  neighborhood: string | null
  email: string | null
  gender: string | null
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
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${leadId}`, { cache: 'no-store' })
      if (!res.ok) {
        setError(res.status === 404 ? 'Conversación no encontrada' : 'Error al cargar')
        return
      }
      const data = (await res.json()) as { lead: LeadDetail; messages: Message[] }
      setLead(data.lead)
      setMessages(data.messages)
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
            <span>Email</span>
            <strong>{lead.email || '—'}</strong>
          </li>
          <li>
            <span>Score / cupo</span>
            <strong>
              {lead.score ?? '—'}
              {lead.quotaSegment ? ` · ${lead.quotaSegment}` : ''}
            </strong>
          </li>
          <li>
            <span>Última actividad</span>
            <strong>{formatWhen(lead.lastActivityAt)}</strong>
          </li>
        </ul>
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
                ? (m.meta!.buttons as { text: string }[])
                : null
              return (
                <div
                  key={m.id}
                  className={`${styles.bubble} ${isOut ? styles.bubbleOut : styles.bubbleIn}`}
                >
                  <div>{m.body}</div>
                  {buttons && buttons.length > 0 ? (
                    <div className={styles.buttons}>
                      {buttons.map((b, i) => (
                        <span key={`${m.id}-b-${i}`} className={styles.chip}>
                          {b.text}
                        </span>
                      ))}
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
      </section>
    </div>
  )
}
