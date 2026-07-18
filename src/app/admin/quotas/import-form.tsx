'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import styles from './quotas.module.css'

interface ImportResult {
  imported: number
  unmatched: Array<{ row: string; reason: string }>
}

export function ImportForm() {
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
          {result.unmatched.length > 0 ? ` · ${result.unmatched.length} no reconocidas` : ''}
        </span>
      ) : null}
      {error ? <span className={styles.rowError}>{error}</span> : null}
      {result && result.unmatched.length > 0 ? (
        <ul className={styles.unmatchedList}>
          {result.unmatched.map((u) => (
            <li key={u.row}>
              {u.row} — {u.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
