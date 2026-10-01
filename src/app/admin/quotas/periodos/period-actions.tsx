'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './periodos.module.css'

interface PeriodActionsProps {
  periodId: string
  label: string
  country: string
  status: 'open' | 'closed'
  objective: number
  achieved: number
  missing: number
  progressPct: number
}

/**
 * Cerrar un periodo deja al país SIN periodo abierto, y por lo tanto cerrado: ningún lead nuevo
 * califica hasta que se abra el siguiente. Es la acción más peligrosa del panel, así que pide
 * tipear la etiqueta del periodo además de mostrar el preview de las cifras que se van a congelar.
 */
export function PeriodActions({
  periodId,
  label,
  country,
  status,
  objective,
  achieved,
  missing,
  progressPct,
}: PeriodActionsProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<'close' | 'reopen' | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'close' | 'reopen') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quotas/periods/${periodId}/${action}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? 'No se pudo completar la acción')
        return
      }
      setConfirming(null)
      setTyped('')
      router.refresh()
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    const isClose = confirming === 'close'
    return (
      <div className={styles.confirmBox}>
        {isClose ? (
          <p>
            Vas a cerrar <strong>{label}</strong> de <strong>{country}</strong> con{' '}
            <strong>
              {achieved}/{objective}
            </strong>{' '}
            ({progressPct}%, faltan {missing}). Esas cifras quedan congeladas y{' '}
            <strong>{country} deja de recibir leads nuevos</strong> hasta que abras el periodo
            siguiente.
          </p>
        ) : (
          <p>
            Vas a reabrir <strong>{label}</strong>. Se <strong>borra el corte guardado</strong> y el
            país vuelve a reclutar contra esta cuota.
          </p>
        )}
        <p>
          Escribí <strong>{label}</strong> para confirmar:
        </p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={busy || typed.trim() !== label}
            onClick={() => void run(confirming)}
          >
            {busy ? 'Procesando…' : isClose ? 'Cerrar corte' : 'Reabrir'}
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={busy}
            onClick={() => {
              setConfirming(null)
              setTyped('')
              setError(null)
            }}
          >
            Cancelar
          </button>
        </div>
        {error ? <div className={styles.rowError}>{error}</div> : null}
      </div>
    )
  }

  return (
    <div className={styles.rowActions}>
      {status === 'open' ? (
        <button type="button" className={styles.dangerBtn} onClick={() => setConfirming('close')}>
          Cerrar corte
        </button>
      ) : (
        <button type="button" className={styles.ghostBtn} onClick={() => setConfirming('reopen')}>
          Reabrir
        </button>
      )}
      {error ? <div className={styles.rowError}>{error}</div> : null}
    </div>
  )
}
