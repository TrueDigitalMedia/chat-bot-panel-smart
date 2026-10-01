'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import styles from './periodos.module.css'

/** Último día del trimestre (en UTC, para que no se corra por zona horaria). */
function quarterBounds(year: number, quarter: number): { startsOn: string; endsOn: string } {
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1))
  const end = new Date(Date.UTC(year, quarter * 3, 0))
  return { startsOn: start.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10) }
}

const now = new Date()
const CURRENT_YEAR = now.getUTCFullYear()
const CURRENT_QUARTER = Math.floor(now.getUTCMonth() / 3) + 1

export function OpenPeriodForm({ countries }: { countries: string[] }) {
  const router = useRouter()
  const initial = quarterBounds(CURRENT_YEAR, CURRENT_QUARTER)
  const [country, setCountry] = useState('')
  const [quarter, setQuarter] = useState(String(CURRENT_QUARTER))
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [startsOn, setStartsOn] = useState(initial.startsOn)
  const [endsOn, setEndsOn] = useState(initial.endsOn)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Al cambiar Q o año se reproponen las fechas del trimestre; el operador puede pisarlas. */
  function syncDates(nextQuarter: string, nextYear: string) {
    const q = Number(nextQuarter)
    const y = Number(nextYear)
    if (!q || !y) return
    const bounds = quarterBounds(y, q)
    setStartsOn(bounds.startsOn)
    setEndsOn(bounds.endsOn)
  }

  async function submit() {
    if (!country) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/quotas/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          quarter: Number(quarter),
          year: Number(year),
          startsOn,
          endsOn,
          label: label || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.message ?? 'No se pudo abrir el periodo')
        return
      }
      setCountry('')
      setLabel('')
      router.refresh()
    } catch {
      setError('No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <form className={styles.openForm} onSubmit={(e) => e.preventDefault()}>
        <label className={styles.field}>
          País
          <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy}>
            <option value="">Elegir…</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Trimestre
          <select
            value={quarter}
            onChange={(e) => {
              setQuarter(e.target.value)
              syncDates(e.target.value, year)
            }}
            disabled={busy}
          >
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Año
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => {
              setYear(e.target.value)
              syncDates(quarter, e.target.value)
            }}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          Desde
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} disabled={busy} />
        </label>
        <label className={styles.field}>
          Hasta
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} disabled={busy} />
        </label>
        <label className={styles.field}>
          Etiqueta (opcional)
          <input
            type="text"
            placeholder={`Q${quarter} ${year}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="button" className={styles.primaryBtn} disabled={busy || !country} onClick={() => void submit()}>
          {busy ? 'Abriendo…' : 'Abrir cuota'}
        </button>
      </form>
      {error ? <p className={styles.rowError}>{error}</p> : null}
    </div>
  )
}
