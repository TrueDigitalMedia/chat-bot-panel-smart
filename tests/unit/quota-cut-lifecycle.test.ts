import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuotaPeriodRow } from '@/lib/quotas/quota-periods'

/**
 * Spec 018 — el ciclo de vida del corte: cerrar, re-cerrar (idempotente) y reabrir.
 *
 * Es la operación más delicada de la feature (cerrar deja al país sin recibir leads) y
 * deliberadamente NO se ejercita contra la base real, así que se cubre acá con dobles de las
 * dos capas de las que depende quota-cuts.ts.
 */
const state = {
  period: null as QuotaPeriodRow | null,
  /** Lo que quedó escrito en quota_period_snapshots. */
  stored: [] as Record<string, unknown>[],
  /** Cuántas veces se recalculó el corte en vivo. */
  liveComputations: 0,
  /** Orden real de las operaciones, para probar "snapshot y DESPUÉS flip de estado". */
  ops: [] as string[],
  /** Simula que otro cierre concurrente ganó: markPeriodClosed devuelve 0 filas. */
  closeLosesRace: false,
  /** Leads calificados con el sello del periodo — el total del que cuelga el "sin región". */
  stampedLeads: 40,
}

function periodFixture(over: Partial<QuotaPeriodRow> = {}): QuotaPeriodRow {
  return {
    id: 'p1',
    country: 'Guatemala',
    label: 'Q4 2026',
    year: 2026,
    quarter: 4,
    startsOn: '2026-10-01',
    endsOn: '2026-12-31',
    status: 'open',
    openedAt: new Date('2026-10-01T00:00:00Z'),
    closedAt: null,
    notes: null,
    ...over,
  }
}

const mocks = vi.hoisted(() => ({
  getQuotaPeriodOrThrow: vi.fn(),
  getOpenPeriod: vi.fn(),
  markPeriodClosed: vi.fn(),
  markPeriodOpen: vi.fn(),
  listRegionObjectives: vi.fn(),
  listQuotaProgress: vi.fn(),
}))

vi.mock('@/lib/quotas/quota-periods', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quotas/quota-periods')>(
    '@/lib/quotas/quota-periods',
  )
  return {
    QuotaPeriodError: actual.QuotaPeriodError,
    QuotaPeriodNotFoundError: actual.QuotaPeriodNotFoundError,
    getQuotaPeriodOrThrow: mocks.getQuotaPeriodOrThrow,
    getOpenPeriod: mocks.getOpenPeriod,
    listQuotaPeriods: vi.fn(async () => []),
    markPeriodClosed: mocks.markPeriodClosed,
    markPeriodOpen: mocks.markPeriodOpen,
  }
})

vi.mock('@/lib/quotas/region-caps', () => ({ listRegionObjectives: mocks.listRegionObjectives }))
vi.mock('@/lib/quotas/quota-progress', () => ({
  listQuotaProgress: mocks.listQuotaProgress,
  QUALIFIED_STATUSES: ['link_sent'],
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    // `select()` sin columnas = la lectura del snapshot; con columnas = el count() de leads
    // sellados que alimenta countUnassignedLeads().
    select: (columns?: Record<string, unknown>) => ({
      from: () => ({
        where: () =>
          Promise.resolve(columns ? [{ count: state.stampedLeads }] : state.stored),
      }),
    }),
    insert: () => ({
      values: (rows: Record<string, unknown>[]) => ({
        onConflictDoNothing: () => {
          state.ops.push('insert-snapshot')
          state.stored.push(...rows)
          return Promise.resolve(undefined)
        },
      }),
    }),
    delete: () => ({
      where: () => {
        state.ops.push('delete-snapshot')
        state.stored = []
        return Promise.resolve(undefined)
      },
    }),
  },
}))

import { closeQuotaPeriod, reopenQuotaPeriod } from '@/lib/quotas/quota-cuts'

beforeEach(() => {
  state.period = periodFixture()
  state.stored = []
  state.liveComputations = 0
  state.ops = []
  state.closeLosesRace = false

  mocks.getQuotaPeriodOrThrow.mockImplementation(async () => state.period!)
  mocks.getOpenPeriod.mockImplementation(async () => null)
  mocks.markPeriodClosed.mockImplementation(async () => {
    state.ops.push('mark-closed')
    if (state.closeLosesRace) return null
    state.period = { ...state.period!, status: 'closed', closedAt: new Date() }
    return state.period
  })
  mocks.markPeriodOpen.mockImplementation(async () => {
    state.ops.push('mark-open')
    state.period = { ...state.period!, status: 'open', closedAt: null }
    return state.period
  })
  mocks.listRegionObjectives.mockImplementation(async () => {
    state.liveComputations++
    return [
      {
        periodId: 'p1',
        country: 'Guatemala',
        region: 'Centro I',
        objective: 100,
        source: 'cap' as const,
        achieved: 40,
        available: 60,
        complete: false,
        mismatch: false,
        deactivated: false,
        nseSum: 100,
        capCount: 100,
      },
    ]
  })
  mocks.listQuotaProgress.mockImplementation(async () => [])
})

describe('closeQuotaPeriod', () => {
  it('congela el corte y marca el periodo cerrado', async () => {
    const result = await closeQuotaPeriod('p1')
    expect(result.alreadyClosed).toBe(false)
    expect(result.period.status).toBe('closed')
    expect(result.totals).toMatchObject({ objective: 100, achieved: 40, missing: 60 })
    expect(state.stored).toHaveLength(1)
  })

  it('escribe el snapshot ANTES de cambiar el estado', async () => {
    // Si el proceso muere en el medio, el periodo sigue abierto y reintentar es seguro.
    await closeQuotaPeriod('p1')
    expect(state.ops).toEqual(['insert-snapshot', 'mark-closed'])
  })

  it('re-cerrar devuelve el corte guardado sin recalcular — un corte que se mueve no es un corte', async () => {
    await closeQuotaPeriod('p1')
    const computationsAfterFirstClose = state.liveComputations

    const again = await closeQuotaPeriod('p1')

    expect(again.alreadyClosed).toBe(true)
    expect(state.liveComputations).toBe(computationsAfterFirstClose)
    expect(again.totals).toMatchObject({ objective: 100, achieved: 40 })
    expect(state.stored).toHaveLength(1)
  })

  it('las cifras congeladas no se mueven aunque cambien los leads después del cierre', async () => {
    await closeQuotaPeriod('p1')
    // Llegan más leads calificados después del corte.
    mocks.listRegionObjectives.mockImplementation(async () => [
      {
        periodId: 'p1',
        country: 'Guatemala',
        region: 'Centro I',
        objective: 100,
        source: 'cap' as const,
        achieved: 95,
        available: 5,
        complete: false,
        mismatch: false,
        deactivated: false,
        nseSum: 100,
        capCount: 100,
      },
    ])

    const again = await closeQuotaPeriod('p1')
    expect(again.totals.achieved).toBe(40)
  })

  it('si otro cierre concurrente gana, responde idempotentemente con lo guardado', async () => {
    state.closeLosesRace = true
    const result = await closeQuotaPeriod('p1')
    expect(result.alreadyClosed).toBe(true)
  })

  it('un periodo abierto y nunca cargado da un corte en cero y no escribe filas', async () => {
    mocks.listRegionObjectives.mockImplementation(async () => [])
    state.stampedLeads = 0
    const result = await closeQuotaPeriod('p1')
    expect(result.totals).toEqual({ objective: 0, achieved: 0, missing: 0, excess: 0, progressPct: 0 })
    expect(state.stored).toHaveLength(0)
    expect(state.ops).toEqual(['mark-closed'])
  })

  it('un periodo con leads pero sin NINGUNA región configurada los reporta igual', async () => {
    // Si no, esos leads quedarían fuera de todo corte: ni en una región (no hay) ni en el total.
    mocks.listRegionObjectives.mockImplementation(async () => [])
    state.stampedLeads = 7
    const result = await closeQuotaPeriod('p1')
    expect(result.totals).toMatchObject({ objective: 0, achieved: 7, excess: 7 })
  })
})

describe('reopenQuotaPeriod', () => {
  beforeEach(async () => {
    await closeQuotaPeriod('p1')
    state.ops = []
  })

  it('reabre y BORRA el corte guardado — un corte rancio al lado de un periodo vivo es peor que ninguno', async () => {
    const reopened = await reopenQuotaPeriod('p1')
    expect(reopened.status).toBe('open')
    expect(state.stored).toHaveLength(0)
    expect(state.ops).toEqual(['delete-snapshot', 'mark-open'])
  })

  it('se niega si el país ya tiene otro periodo abierto', async () => {
    mocks.getOpenPeriod.mockImplementation(async () => periodFixture({ id: 'p2', label: 'Q1 2027' }))
    await expect(reopenQuotaPeriod('p1')).rejects.toMatchObject({
      code: 'period_already_open',
      openPeriodId: 'p2',
    })
    // Y no toca nada.
    expect(state.stored).toHaveLength(1)
    expect(state.ops).toEqual([])
  })

  it('se niega sobre un periodo que no está cerrado', async () => {
    state.period = periodFixture({ status: 'open' })
    await expect(reopenQuotaPeriod('p1')).rejects.toMatchObject({ code: 'period_not_closed' })
    expect(state.ops).toEqual([])
  })
})

// Spec 018 — los leads del periodo que no caen en ninguna región del corte (en la práctica, los
// que tienen `nse_region` nulo) tienen que aparecer, no desaparecer: si no, el corte no cuadra con
// su propio export de leads. Caso real: Guatemala cerraba 116 contra 122 leads sellados.
describe('closeQuotaPeriod — leads sin región asignada', () => {
  it('agrega una fila "sin región" con la diferencia entre los leads sellados y los de región', async () => {
    state.stampedLeads = 46 // 40 en Centro I + 6 sin región
    const result = await closeQuotaPeriod('p1')

    const unassigned = result.snapshot.find((r) => r.scope === 'region' && r.region === '')
    expect(unassigned).toMatchObject({ objective: 0, achieved: 6, missing: 0 })
    expect(result.totals.achieved).toBe(46)
  })

  it('no agrega la fila cuando todos los leads sellados caen en alguna región', async () => {
    state.stampedLeads = 40
    const result = await closeQuotaPeriod('p1')
    expect(result.snapshot.some((r) => r.scope === 'region' && r.region === '')).toBe(false)
    expect(result.totals.achieved).toBe(40)
  })

  it('nunca produce un "sin región" negativo si el conteo por región supera al sellado', async () => {
    state.stampedLeads = 10
    const result = await closeQuotaPeriod('p1')
    expect(result.snapshot.some((r) => r.region === '')).toBe(false)
  })
})
