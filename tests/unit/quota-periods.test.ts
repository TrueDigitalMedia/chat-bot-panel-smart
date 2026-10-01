import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Spec 018 — apertura/cierre de periodos y la aritmética del corte.
 *
 * Fake en memoria de `db` con la forma mínima que usan quota-periods.ts y quota-cuts.ts, para que
 * sean tests unitarios de verdad (sin Postgres).
 */
const state: {
  periods: Array<{
    id: string
    country: string
    label: string
    year: number
    quarter: number
    startsOn: string
    endsOn: string
    status: string
    openedAt: Date
    closedAt: Date | null
    notes: string | null
  }>
  snapshots: Array<Record<string, unknown>>
} = { periods: [], snapshots: [] }

let nextId = 1
/** Se lanza en el próximo insert, para simular la carrera que ataja el índice único parcial. */
let insertError: { code: string } | null = null

function periodRow(over: Partial<(typeof state.periods)[number]> = {}) {
  return {
    id: `p${nextId++}`,
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

const COND = { country: null as string | null, status: null as string | null, id: null as string | null }

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  return {
    ...actual,
    // `eq` registra el par (columna, valor) para que el fake pueda filtrar `state.periods` como
    // lo haría Postgres, en vez de devolver siempre todo.
    eq: (column: unknown, value: unknown) => ({ __eq: true, column, value }),
    and: (...conds: unknown[]) => ({ __and: true, conds }),
    inArray: (column: unknown, values: unknown[]) => ({ __in: true, column, values }),
  }
})

function matches(row: (typeof state.periods)[number], cond: unknown): boolean {
  const c = cond as { __eq?: boolean; __and?: boolean; column?: { name?: string }; value?: unknown; conds?: unknown[] }
  if (c == null) return true
  if (c.__and) return (c.conds ?? []).every((x) => matches(row, x))
  if (c.__eq) {
    const name = c.column?.name
    if (name === 'country') return row.country === c.value
    if (name === 'status') return row.status === c.value
    if (name === 'id') return row.id === c.value
    if (name === 'label') return row.label === c.value
  }
  return true
}

vi.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => {
        const run = (cond?: unknown) => Promise.resolve(state.periods.filter((r) => matches(r, cond)))
        const whereResult = (cond?: unknown) =>
          Object.assign(run(cond), {
            limit: () => run(cond),
            orderBy: () => run(cond),
          })
        return {
          where: (cond?: unknown) => whereResult(cond),
          orderBy: () => run(),
        }
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
        returning: () => {
          if (insertError) {
            const err = insertError
            insertError = null
            return Promise.reject(err)
          }
          const list = Array.isArray(values) ? values : [values]
          const rows = list.map((v) => periodRow(v as Partial<(typeof state.periods)[number]>))
          state.periods.push(...rows)
          return Promise.resolve(rows)
        },
        onConflictDoNothing: () => Promise.resolve(undefined),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => ({
          returning: () => {
            const row = state.periods.find((r) => matches(r, cond))
            if (!row) return Promise.resolve([])
            Object.assign(row, patch)
            return Promise.resolve([row])
          },
        }),
      }),
    }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  },
}))

import {
  openQuotaPeriod,
  getOpenPeriod,
  QuotaPeriodError,
  QuotaPeriodNotFoundError,
} from '@/lib/quotas/quota-periods'

beforeEach(() => {
  state.periods = []
  state.snapshots = []
  nextId = 1
  insertError = null
})

const VALID = {
  country: 'Guatemala',
  quarter: 4,
  year: 2026,
  startsOn: '2026-10-01',
  endsOn: '2026-12-31',
} as const

describe('openQuotaPeriod — validación', () => {
  it('abre un periodo con la etiqueta Q{trimestre} {año} por defecto', async () => {
    const row = await openQuotaPeriod(VALID)
    expect(row).toMatchObject({ country: 'Guatemala', label: 'Q4 2026', status: 'open' })
  })

  it('rechaza un país que no está en el registro', async () => {
    await expect(openQuotaPeriod({ ...VALID, country: 'Narnia' })).rejects.toMatchObject({
      code: 'invalid_country',
    })
  })

  it('canonicaliza el país antes de validar', async () => {
    const row = await openQuotaPeriod({ ...VALID, country: 'panama' })
    expect(row.country).toBe('Panamá')
  })

  it('rechaza un trimestre fuera de 1..4', async () => {
    for (const quarter of [0, 5, 2.5]) {
      await expect(openQuotaPeriod({ ...VALID, quarter })).rejects.toMatchObject({
        code: 'invalid_quarter',
      })
    }
  })

  it('rechaza un rango de fechas invertido y fechas mal formadas', async () => {
    await expect(
      openQuotaPeriod({ ...VALID, startsOn: '2026-12-31', endsOn: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'invalid_date_range' })
    await expect(openQuotaPeriod({ ...VALID, startsOn: '01/10/2026' })).rejects.toMatchObject({
      code: 'invalid_date_range',
    })
  })

  it('acepta inicio y fin el mismo día', async () => {
    const row = await openQuotaPeriod({ ...VALID, startsOn: '2026-10-01', endsOn: '2026-10-01' })
    expect(row.startsOn).toBe('2026-10-01')
  })

  it('rechaza un segundo periodo abierto para el mismo país, y dice cuál lo bloquea', async () => {
    const first = await openQuotaPeriod(VALID)
    await expect(openQuotaPeriod({ ...VALID, label: 'Q4 2026 (recarga)' })).rejects.toMatchObject({
      code: 'period_already_open',
      openPeriodId: first.id,
    })
  })

  it('permite un periodo abierto por país a la vez, en paralelo entre países', async () => {
    await openQuotaPeriod(VALID)
    const hn = await openQuotaPeriod({ ...VALID, country: 'Honduras' })
    expect(hn.country).toBe('Honduras')
    expect((await getOpenPeriod('Guatemala'))?.country).toBe('Guatemala')
  })

  it('traduce la violación de unicidad (la carrera que ataja el índice parcial) al mismo error', async () => {
    // Nada abierto todavía, así que el pre-chequeo pasa; el 23505 llega desde Postgres.
    state.periods.push(periodRow({ id: 'ya-abierto', status: 'open' }))
    insertError = { code: '23505' }
    await expect(openQuotaPeriod(VALID)).rejects.toMatchObject({ code: 'period_already_open' })
  })

  it('un 23505 sin periodo abierto es un choque de etiqueta', async () => {
    insertError = { code: '23505' }
    await expect(openQuotaPeriod(VALID)).rejects.toMatchObject({ code: 'duplicate_label' })
  })

  it('propaga cualquier otro error de la base sin disfrazarlo', async () => {
    insertError = { code: '08006' }
    await expect(openQuotaPeriod(VALID)).rejects.not.toBeInstanceOf(QuotaPeriodError)
  })
})

describe('getOpenPeriod', () => {
  it('devuelve null cuando el país no tiene ninguno abierto — el país queda cerrado', async () => {
    state.periods.push(periodRow({ status: 'closed' }))
    expect(await getOpenPeriod('Guatemala')).toBeNull()
  })

  it('devuelve null para un país vacío sin consultar nada', async () => {
    expect(await getOpenPeriod('')).toBeNull()
  })
})

describe('getQuotaPeriodOrThrow', () => {
  it('tira QuotaPeriodNotFoundError para un id inexistente', async () => {
    const { getQuotaPeriodOrThrow } = await import('@/lib/quotas/quota-periods')
    await expect(getQuotaPeriodOrThrow('no-existe')).rejects.toBeInstanceOf(QuotaPeriodNotFoundError)
  })
})
