import { describe, it, expect, vi } from 'vitest'
import type { RegionObjectiveRow } from '@/lib/quotas/region-caps'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'

// buildPeriodSnapshotRows/totalsFromSnapshot son puras, pero el módulo arrastra el cliente de DB.
vi.mock('@/lib/db/client', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: {} }))

import { buildPeriodSnapshotRows, totalsFromSnapshot } from '@/lib/quotas/quota-cuts'

function region(over: Partial<RegionObjectiveRow> = {}): RegionObjectiveRow {
  return {
    periodId: 'p1',
    country: 'Guatemala',
    region: 'Centro I',
    objective: 100,
    source: 'cap',
    achieved: 40,
    available: 60,
    complete: false,
    mismatch: false,
    deactivated: false,
    nseSum: 100,
    capCount: 100,
    ...over,
  }
}

function cell(over: Partial<QuotaProgress> = {}): QuotaProgress {
  return {
    id: 'c1',
    periodId: 'p1',
    country: 'Guatemala',
    region: 'Centro I',
    dimensionType: 'nse',
    dimensionValue: 'Nivel 2',
    target: 60,
    achieved: 15,
    available: 45,
    active: true,
    notes: null,
    progressPct: 25,
    updatedAt: new Date(),
    ...over,
  }
}

describe('buildPeriodSnapshotRows — las cifras congeladas del corte', () => {
  it('escribe una fila por región y una por celda, distinguidas por scope', () => {
    const rows = buildPeriodSnapshotRows([region()], [cell()])
    expect(rows.filter((r) => r.scope === 'region')).toHaveLength(1)
    expect(rows.filter((r) => r.scope === 'cell')).toHaveLength(1)
  })

  it('calcula faltante y % por región', () => {
    const [r] = buildPeriodSnapshotRows([region({ objective: 100, achieved: 40 })], [])
    expect(r).toMatchObject({ objective: 100, achieved: 40, missing: 60, progressPct: 40 })
  })

  it('nunca da faltante negativo ni más de 100% cuando la región se pasó del objetivo', () => {
    const [r] = buildPeriodSnapshotRows([region({ objective: 20, achieved: 26 })], [])
    expect(r.missing).toBe(0)
    expect(r.progressPct).toBe(100)
  })

  it('una región cerrada (objetivo 0) queda en 0% y no divide por cero', () => {
    const [r] = buildPeriodSnapshotRows([region({ objective: 0, achieved: 3, source: 'none' })], [])
    expect(r).toMatchObject({ objective: 0, achieved: 3, missing: 0, progressPct: 0, source: 'none' })
  })

  it('deja dimensión y valor en cadena vacía (no NULL) en las filas de región', () => {
    // Con NULL el índice único de quota_period_snapshots no chocaría (en Postgres los NULL son
    // distintos entre sí) y un cierre reintentado duplicaría las filas de región.
    const [r] = buildPeriodSnapshotRows([region()], [])
    expect(r.dimensionType).toBe('')
    expect(r.dimensionValue).toBe('')
  })

  it('marca deactivated en una región desactivada y en una línea inactiva', () => {
    const rows = buildPeriodSnapshotRows([region({ deactivated: true })], [cell({ active: false })])
    expect(rows.find((r) => r.scope === 'region')!.deactivated).toBe(true)
    expect(rows.find((r) => r.scope === 'cell')!.deactivated).toBe(true)
  })

  it('las filas de celda no llevan source (es propio del objetivo por región)', () => {
    const rows = buildPeriodSnapshotRows([], [cell()])
    expect(rows[0].source).toBeNull()
  })
})

describe('totalsFromSnapshot', () => {
  it('suma solo las filas de región, nunca las de celda', () => {
    // El objetivo por región es el techo duro del cliente y su "conseguidos" incluye los leads
    // de la excepción (embarazo/bebé), que no viven en ninguna celda. Sumar ambos niveles
    // contaría doble.
    const rows = buildPeriodSnapshotRows(
      [
        region({ region: 'Centro I', objective: 100, achieved: 40 }),
        region({ region: 'Norte', objective: 50, achieved: 50 }),
      ],
      [cell({ target: 60, achieved: 15 }), cell({ dimensionValue: 'Nivel 3', target: 40, achieved: 10 })],
    )
    expect(totalsFromSnapshot(rows)).toEqual({
      objective: 150,
      achieved: 90,
      missing: 60,
      excess: 0,
      progressPct: 60,
    })
  })

  it('un periodo recién abierto y vacío da un corte en cero, no NaN', () => {
    expect(totalsFromSnapshot([])).toEqual({
      objective: 0,
      achieved: 0,
      missing: 0,
      excess: 0,
      progressPct: 0,
    })
  })

  it('Σ de celdas puede ser menor que el total de región — los leads por excepción', () => {
    // Región con 40 conseguidos, de los cuales solo 25 están atribuidos a celdas NSE: los otros
    // 15 entraron por la excepción. No es un bug; es por qué el corte guarda los dos niveles.
    const rows = buildPeriodSnapshotRows(
      [region({ objective: 100, achieved: 40 })],
      [cell({ target: 60, achieved: 25 })],
    )
    const totals = totalsFromSnapshot(rows)
    const cellAchieved = rows.filter((r) => r.scope === 'cell').reduce((sum, r) => sum + r.achieved, 0)
    expect(totals.achieved).toBe(40)
    expect(cellAchieved).toBe(25)
  })

  // El caso real de Costa Rica (2026-10-01): "Area metropolitana III" tiene objetivo 0 y 56 leads
  // calificados, de sobre-entrega histórica. Sin exponer el excedente, la fila de totales leía
  // 358 objetivo / 159 conseguidos / 255 faltante y parecía un error de aritmética.
  it('expone el excedente para que conseguidos + faltante − excedente = objetivo', () => {
    const rows = buildPeriodSnapshotRows(
      [
        region({ region: 'Area metropolitana I', objective: 48, achieved: 34 }),
        region({ region: 'Area metropolitana II', objective: 60, achieved: 23 }),
        region({ region: 'Area metropolitana III', objective: 0, achieved: 56, source: 'none' }),
        region({ region: 'Norte', objective: 120, achieved: 25 }),
        region({ region: 'Sur occidente', objective: 130, achieved: 21 }),
      ],
      [],
    )
    const t = totalsFromSnapshot(rows)
    expect(t).toMatchObject({ objective: 358, achieved: 159, missing: 255, excess: 56 })
    expect(t.achieved - t.excess + t.missing).toBe(t.objective)
  })
})
