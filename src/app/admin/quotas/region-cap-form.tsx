'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './quotas.module.css'
import type { RegionCapRow } from '@/lib/quotas/region-caps'

interface RegionCapItem extends RegionCapRow {
  achieved: number
}

interface RegionCapFormProps {
  caps: RegionCapItem[]
  countries: string[]
  regionsByCountry: Record<string, string[]>
}

export function RegionCapForm({ caps, countries, regionsByCountry }: RegionCapFormProps) {
  const router = useRouter()
  const sorted = [...caps].sort((a, b) => a.country.localeCompare(b.country) || a.region.localeCompare(b.region))

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>País</th>
            <th>Región</th>
            <th>Tope</th>
            <th>Conseguidos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((cap) => (
            <RegionCapRowForm key={cap.id} cap={cap} onSaved={() => router.refresh()} />
          ))}
          <NewRegionCapRow countries={countries} regionsByCountry={regionsByCountry} onSaved={() => router.refresh()} />
        </tbody>
      </table>
    </div>
  )
}

function RegionCapRowForm({ cap, onSaved }: { cap: RegionCapItem; onSaved: () => void }) {
  const [capCount, setCapCount] = useState<string>(cap.capCount == null ? '' : String(cap.capCount))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/quotas/region-caps/${cap.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capCount: capCount === '' ? null : Number(capCount) }),
      })
      if (!res.ok) {
        setError('Error al guardar')
        return
      }
      onSaved()
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td>{cap.country}</td>
      <td>{cap.region}</td>
      <td>
        <input
          type="number"
          min={0}
          placeholder="Sin tope"
          value={capCount}
          onChange={(e) => setCapCount(e.target.value)}
          className={styles.targetInput}
          disabled={busy}
        />
      </td>
      <td>{cap.achieved}</td>
      <td>
        <div className={styles.rowActions}>
          <button type="button" disabled={busy} onClick={() => void save()} className={styles.saveBtn}>
            Guardar
          </button>
        </div>
        {error ? <div className={styles.rowError}>{error}</div> : null}
      </td>
    </tr>
  )
}

function NewRegionCapRow({
  countries,
  regionsByCountry,
  onSaved,
}: {
  countries: string[]
  regionsByCountry: Record<string, string[]>
  onSaved: () => void
}) {
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [capCount, setCapCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableRegions = country ? (regionsByCountry[country] ?? []) : []

  async function create() {
    if (!country || !region) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/quotas/region-caps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          region,
          capCount: capCount === '' ? null : Number(capCount),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error === 'conflict' ? 'Ya existe un tope para esa región' : 'Error al crear')
        return
      }
      setCountry('')
      setRegion('')
      setCapCount('')
      onSaved()
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td>
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value)
            setRegion('')
          }}
          disabled={busy}
        >
          <option value="">País…</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={busy || !country}>
          <option value="">Región…</option>
          {availableRegions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          min={0}
          placeholder="Sin tope"
          value={capCount}
          onChange={(e) => setCapCount(e.target.value)}
          className={styles.targetInput}
          disabled={busy}
        />
      </td>
      <td>—</td>
      <td>
        <div className={styles.rowActions}>
          <button
            type="button"
            disabled={busy || !country || !region}
            onClick={() => void create()}
            className={styles.saveBtn}
          >
            Agregar
          </button>
        </div>
        {error ? <div className={styles.rowError}>{error}</div> : null}
      </td>
    </tr>
  )
}
