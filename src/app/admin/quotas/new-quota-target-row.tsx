'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './quotas.module.css'
import { AGE_BANDS, HOUSEHOLD_BANDS, type DimensionType } from '@/lib/quotas/dimension-catalog'

const DIMENSION_LABELS: Record<DimensionType, string> = {
  nse: 'NSE',
  edad: 'Edad',
  integrantes: 'Integrantes',
}

// 'nse' isn't here — its valid values are country-specific (CAM "Nivel 1-4" vs Ecuador
// "AB"/"C"/"D/E", spec 014 FR-009/FR-014) and come from the nseLevelsByCountry prop instead.
const VALUES_BY_DIMENSION: Record<Exclude<DimensionType, 'nse'>, readonly string[]> = {
  edad: AGE_BANDS,
  integrantes: HOUSEHOLD_BANDS,
}

interface NewQuotaTargetRowProps {
  countries: string[]
  regionsByCountry: Record<string, string[]>
  nseLevelsByCountry: Record<string, string[]>
}

export function NewQuotaTargetRow({ countries, regionsByCountry, nseLevelsByCountry }: NewQuotaTargetRowProps) {
  const router = useRouter()
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [dimensionType, setDimensionType] = useState<DimensionType | ''>('')
  const [dimensionValue, setDimensionValue] = useState('')
  const [targetCount, setTargetCount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableRegions = country ? (regionsByCountry[country] ?? []) : []
  const availableValues =
    dimensionType === 'nse'
      ? (nseLevelsByCountry[country] ?? [])
      : dimensionType
        ? VALUES_BY_DIMENSION[dimensionType]
        : []

  async function create() {
    if (!country || !region || !dimensionType || !dimensionValue) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          region,
          dimensionType,
          dimensionValue,
          targetCount: targetCount === '' ? 0 : Number(targetCount),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error === 'conflict' ? 'Ya existe esa cuota (edítala en la tabla)' : 'Error al crear')
        return
      }
      setCountry('')
      setRegion('')
      setDimensionType('')
      setDimensionValue('')
      setTargetCount('0')
      router.refresh()
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
        <select
          value={dimensionType}
          onChange={(e) => {
            setDimensionType(e.target.value as DimensionType)
            setDimensionValue('')
          }}
          disabled={busy}
        >
          <option value="">Dimensión…</option>
          {(Object.keys(DIMENSION_LABELS) as DimensionType[]).map((d) => (
            <option key={d} value={d}>
              {DIMENSION_LABELS[d]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={dimensionValue}
          onChange={(e) => setDimensionValue(e.target.value)}
          disabled={busy || !dimensionType || (dimensionType === 'nse' && !country)}
        >
          <option value="">Valor…</option>
          {availableValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          min={0}
          value={targetCount}
          onChange={(e) => setTargetCount(e.target.value)}
          className={styles.targetInput}
          disabled={busy}
        />
      </td>
      <td colSpan={4}>
        <div className={styles.rowActions}>
          <button
            type="button"
            disabled={busy || !country || !region || !dimensionType || !dimensionValue}
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
