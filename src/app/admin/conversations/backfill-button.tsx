'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './conversations.module.css'

export function BackfillEvalsButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <div className={styles.headerActions}>
      <button
        type="button"
        className={styles.backfillBtn}
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMsg(null)
          try {
            const res = await fetch('/api/evals/backfill', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ onlyMissing: false }),
            })
            const data = (await res.json()) as {
              evaluated: number
              skipped: number
              passed: number
              failed: number
            }
            if (!res.ok) {
              setMsg('Error al backfill')
            } else {
              setMsg(
                `${data.evaluated} eval · ${data.passed} pass · ${data.failed} fail · ${data.skipped} skip`,
              )
              router.refresh()
            }
          } catch {
            setMsg('No se pudo conectar')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Evaluando…' : 'Correr evals'}
      </button>
      {msg ? <span className={styles.muted}>{msg}</span> : null}
    </div>
  )
}
