'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './dashboard.module.css'

interface FiltersFormProps {
  countries: string[]
  nseLevelsByCountry: Record<string, string[]>
  regionsByCountry: Record<string, string[]>
}

export function FiltersForm({ countries, nseLevelsByCountry, regionsByCountry }: FiltersFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedCountry = searchParams.get('country') ?? ''
  const availableRegions = selectedCountry ? (regionsByCountry[selectedCountry] ?? []) : []
  // With no country selected, offer the union of every country's NSE values (this
  // dashboard is scoped to dimensionType 'nse' only — see the page.tsx comment) so an
  // admin can still filter across countries by NSE segment.
  const dimensionValues = selectedCountry
    ? (nseLevelsByCountry[selectedCountry] ?? [])
    : [...new Set(Object.values(nseLevelsByCountry).flat())]

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'country') next.delete('region')
    router.push(`/admin/dashboard?${next.toString()}`)
  }

  const hasFilters = searchParams.toString().length > 0

  return (
    <form className={styles.filtersForm} onSubmit={(e) => e.preventDefault()}>
      <label className={styles.filterField}>
        País
        <select value={selectedCountry} onChange={(e) => update('country', e.target.value)}>
          <option value="">Todos</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filterField}>
        Región
        <select
          value={searchParams.get('region') ?? ''}
          onChange={(e) => update('region', e.target.value)}
          disabled={!selectedCountry}
        >
          <option value="">Todas</option>
          {availableRegions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filterField}>
        Nivel NSE
        <select
          value={searchParams.get('dimensionValue') ?? ''}
          onChange={(e) => update('dimensionValue', e.target.value)}
        >
          <option value="">Todos</option>
          {dimensionValues.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filterField}>
        Canal
        <select value={searchParams.get('channel') ?? ''} onChange={(e) => update('channel', e.target.value)}>
          <option value="">Todos</option>
          <option value="telegram">Telegram</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="web">Web</option>
        </select>
      </label>
      <label className={styles.filterField}>
        Desde
        <input
          type="date"
          value={searchParams.get('from') ?? ''}
          onChange={(e) => update('from', e.target.value)}
        />
      </label>
      <label className={styles.filterField}>
        Hasta
        <input type="date" value={searchParams.get('to') ?? ''} onChange={(e) => update('to', e.target.value)} />
      </label>
      {hasFilters ? (
        <button
          type="button"
          className={styles.filterClear}
          onClick={() => router.push('/admin/dashboard')}
        >
          Limpiar filtros
        </button>
      ) : null}
    </form>
  )
}
