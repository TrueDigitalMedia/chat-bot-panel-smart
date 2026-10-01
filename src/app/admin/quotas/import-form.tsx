'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import styles from './quotas.module.css'

interface ImportResult {
  imported: number
  unmatched: Array<{ row: string; reason: string }>
  periodsUsed: Array<{ country: string; periodId: string; label: string }>
}

const UNMATCHED_LABELS: Record<string, string> = {
  country_not_recognized: 'país no reconocido',
  region_not_recognized: 'región no reconocida',
  no_open_period: 'sin periodo de cuota abierto — abrilo primero',
  period_closed: 'el periodo indicado está cerrado',
}

/**
 * `periodId` fuerza un periodo concreto; sin él, cada hoja va al periodo ABIERTO de su país y una
 * hoja cuyo país no tiene periodo abierto vuelve en `unmatched`, nunca cargada en otro trimestre.
 */
export function ImportForm({ periodId }: { periodId?: string } = {}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (periodId) formData.append('periodId', periodId)
      const res = await fetch('/api/admin/quotas/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al importar')
        return
      }
      setResult(data as ImportResult)
      router.refresh()
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={styles.importForm}>
      <label className={styles.importLabel}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
          className={styles.importInput}
        />
        <span className={styles.importBtn}>{busy ? 'Importando…' : 'Importar Excel'}</span>
      </label>
      {result ? (
        <span className={styles.muted}>
          {result.imported} importadas
          {result.periodsUsed.length > 0
            ? ` en ${result.periodsUsed.map((p) => `${p.country} ${p.label}`).join(', ')}`
            : ''}
          {result.unmatched.length > 0 ? ` · ${result.unmatched.length} no cargadas` : ''}
        </span>
      ) : null}
      {error ? <span className={styles.rowError}>{error}</span> : null}
      {result && result.unmatched.length > 0 ? (
        <ul className={styles.unmatchedList}>
          {result.unmatched.map((u) => (
            <li key={u.row}>
              {u.row} — {UNMATCHED_LABELS[u.reason] ?? u.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
