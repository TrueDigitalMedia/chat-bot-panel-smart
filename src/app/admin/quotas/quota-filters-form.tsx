'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './quotas.module.css'
import { AGE_BANDS, HOUSEHOLD_BANDS, NSE_LEVELS, type DimensionType } from '@/lib/quotas/dimension-catalog'

const DIMENSION_LABELS: Record<DimensionType, string> = {
  nse: 'NSE',
  edad: 'Edad',
  integrantes: 'Integrantes',
}

const VALUES_BY_DIMENSION: Record<DimensionType, readonly string[]> = {
  nse: NSE_LEVELS,
  edad: AGE_BANDS,
  integrantes: HOUSEHOLD_BANDS,
}

interface QuotaFiltersFormProps {
  countries: string[]
  regionsByCountry: Record<string, string[]>
}

export function QuotaFiltersForm({ countries, regionsByCountry }: QuotaFiltersFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedCountry = searchParams.get('country') ?? ''
  const selectedDimensionType = (searchParams.get('dimensionType') ?? '') as DimensionType | ''
  const availableRegions = selectedCountry ? (regionsByCountry[selectedCountry] ?? []) : []
  const availableValues = selectedDimensionType ? VALUES_BY_DIMENSION[selectedDimensionType] : []

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'country') next.delete('region')
    if (key === 'dimensionType') next.delete('dimensionValue')
    router.push(`/admin/quotas?${next.toString()}`)
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
        Dimensión
        <select value={selectedDimensionType} onChange={(e) => update('dimensionType', e.target.value)}>
          <option value="">Todas</option>
          {(Object.keys(DIMENSION_LABELS) as DimensionType[]).map((d) => (
            <option key={d} value={d}>
              {DIMENSION_LABELS[d]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filterField}>
        Valor
        <select
          value={searchParams.get('dimensionValue') ?? ''}
          onChange={(e) => update('dimensionValue', e.target.value)}
          disabled={!selectedDimensionType}
        >
          <option value="">Todos</option>
          {availableValues.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {hasFilters ? (
        <button type="button" className={styles.filterClear} onClick={() => router.push('/admin/quotas')}>
          Limpiar filtros
        </button>
      ) : null}
    </form>
  )
}
