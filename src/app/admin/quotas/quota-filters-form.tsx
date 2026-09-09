'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import styles from './quotas.module.css'
import { AGE_BANDS, HOUSEHOLD_BANDS, type DimensionType } from '@/lib/quotas/dimension-catalog'

const DIMENSION_LABELS: Record<DimensionType, string> = {
  nse: 'NSE',
  edad: 'Edad',
  integrantes: 'Integrantes',
}

// 'nse' isn't here — see new-quota-target-row.tsx's identical comment.
const VALUES_BY_DIMENSION: Record<Exclude<DimensionType, 'nse'>, readonly string[]> = {
  edad: AGE_BANDS,
  integrantes: HOUSEHOLD_BANDS,
}

interface QuotaFiltersFormProps {
  countries: string[]
  regionsByCountry: Record<string, string[]>
  nseLevelsByCountry: Record<string, string[]>
}

export function QuotaFiltersForm({ countries, regionsByCountry, nseLevelsByCountry }: QuotaFiltersFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedCountry = searchParams.get('country') ?? ''
  const selectedDimensionType = (searchParams.get('dimensionType') ?? '') as DimensionType | ''
  const availableRegions = selectedCountry ? (regionsByCountry[selectedCountry] ?? []) : []
  // Filtering (unlike creating) doesn't require a country first: with no country selected,
  // offer the union of every country's NSE values so an admin can still filter across
  // countries by NSE segment (e.g. see all "AB" leads, Ecuador or otherwise).
  const availableValues =
    selectedDimensionType === 'nse'
      ? selectedCountry
        ? (nseLevelsByCountry[selectedCountry] ?? [])
        : [...new Set(Object.values(nseLevelsByCountry).flat())]
      : selectedDimensionType
        ? VALUES_BY_DIMENSION[selectedDimensionType]
        : []

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
