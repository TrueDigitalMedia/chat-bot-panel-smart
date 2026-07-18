'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './quotas.module.css'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'

function pctClass(pct: number): string {
  if (pct < 25) return styles.pctLow
  if (pct < 75) return styles.pctMid
  return styles.pctHigh
}

export function QuotaRowForm({ item }: { item: QuotaProgress }) {
  const router = useRouter()
  const [target, setTarget] = useState(item.target)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quotas/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        setError('Error al guardar')
        return
      }
      router.refresh()
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className={!item.active ? styles.inactiveRow : undefined}>
      <td>{item.country}</td>
      <td>{item.region}</td>
      <td>{item.nseLevel}</td>
      <td>
        <input
          type="number"
          min={0}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className={styles.targetInput}
          disabled={busy}
        />
      </td>
      <td>{item.achieved}</td>
      <td>{item.available}</td>
      <td>
        <span className={`${styles.pctBadge} ${pctClass(item.progressPct)}`}>{item.progressPct}%</span>
      </td>
      <td>
        <div className={styles.rowActions}>
          <button
            type="button"
            disabled={busy || target === item.target}
            onClick={() => save({ targetCount: target })}
            className={styles.saveBtn}
          >
            Guardar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save({ active: !item.active })}
            className={styles.toggleBtn}
          >
            {item.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
        {error ? <div className={styles.rowError}>{error}</div> : null}
      </td>
    </tr>
  )
}
