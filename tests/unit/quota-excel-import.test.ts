import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'

interface UpsertCall {
  country: string
  region: string
  nseLevel: string
  targetCount: number
}

const upsertCalls: UpsertCall[] = []
let mockedProgress: QuotaProgress[] = []

vi.mock('@/lib/quotas/quota-targets', () => ({
  upsertQuotaTarget: vi.fn(async (input: UpsertCall) => {
    upsertCalls.push(input)
    return { id: 'x', ...input }
  }),
}))

vi.mock('@/lib/quotas/quota-progress', () => ({
  listQuotaProgress: vi.fn(async () => mockedProgress),
}))

import { importQuotaTargetsFromWorkbook } from '@/lib/quotas/excel-import'
import { exportQuotaTargetsToWorkbook } from '@/lib/quotas/excel-export'

function buildWorkbook(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'CAM')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const HEADER_ROWS: unknown[][] = [
  [
    ' ',
    'Nivel 1',
    '',
    '',
    'Nivel 2',
    '',
    '',
    'Nivel 3',
    '',
    '',
    'Nivel 4',
    '',
    '',
  ],
  [
    '',
    'Objetivo',
    'Conseguidos',
    'Disponibles',
    'Objetivo',
    'Conseguidos',
    'Disponibles',
    'Objetivo',
    'Conseguidos',
    'Disponibles',
    'Objetivo',
    'Conseguidos',
    'Disponibles',
  ],
]

describe('importQuotaTargetsFromWorkbook — normalization against the real catalog (research.md R1/R2)', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('maps "RD - Cibao Sin Santiago" to Rep. Dominicana / Cibao sin Santiago (RD alias + case-insensitive region match)', async () => {
    const buf = buildWorkbook([
      ...HEADER_ROWS,
      ['RD - Cibao Sin Santiago', 0, 0, 0, 165, 1, 164, 40, 0, 40, 85, 2, 83],
    ])
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.unmatched).toEqual([])
    expect(result.imported).toBe(4)
    const nivel2 = upsertCalls.find((c) => c.nseLevel === 'Nivel 2')
    expect(nivel2).toMatchObject({
      country: 'Rep. Dominicana',
      region: 'Cibao sin Santiago',
      targetCount: 165,
    })
  })

  it('maps "Panama - Norte" to Panamá (accent normalized)', async () => {
    const buf = buildWorkbook([...HEADER_ROWS, ['Panama - Norte', 0, 0, 0, 73, 2, 71, 73, 0, 73, 73, 1, 72]])
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.unmatched).toEqual([])
    expect(upsertCalls[0]).toMatchObject({ country: 'Panamá' })
  })

  it('reports an unrecognized country in unmatched, without upserting anything', async () => {
    const buf = buildWorkbook([...HEADER_ROWS, ['Narnia - Centro', 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0]])
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(0)
    expect(result.unmatched).toEqual([{ row: 'Narnia - Centro', reason: 'country_not_recognized' }])
    expect(upsertCalls).toHaveLength(0)
  })

  it('reports an unrecognized region in unmatched, without upserting anything', async () => {
    const buf = buildWorkbook([
      ...HEADER_ROWS,
      ['Guatemala - Region Inventada', 0, 0, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0],
    ])
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(0)
    expect(result.unmatched).toEqual([
      { row: 'Guatemala - Region Inventada', reason: 'region_not_recognized' },
    ])
  })

  it('skips header rows (no " - " in the label) without treating them as data', async () => {
    const buf = buildWorkbook([...HEADER_ROWS, ['Guatemala - Centro I', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(4)
    expect(result.unmatched).toEqual([])
  })

  it('imports a target of 0 explicitly (a real, meaningful value — not skipped, research.md R1)', async () => {
    const buf = buildWorkbook([...HEADER_ROWS, ['Costa Rica - Area metropolitana I', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(4)
    expect(upsertCalls.every((c) => c.targetCount === 0)).toBe(true)
  })

  it('throws when the workbook has no CAM sheet', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['x']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'OtroSheet')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    await expect(importQuotaTargetsFromWorkbook(buf)).rejects.toThrow(/CAM/)
  })
})

describe('round-trip: export(state) → import(that file) reproduces the same targets (US5)', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('re-imports the exact country/region/nseLevel/targetCount for every row', async () => {
    mockedProgress = [
      {
        id: 'a',
        country: 'Guatemala',
        region: 'Sur Occidente Chico',
        nseLevel: 'Nivel 2',
        target: 50,
        achieved: 4,
        available: 46,
        active: true,
        notes: null,
        progressPct: 8,
        updatedAt: new Date(),
      },
      {
        id: 'b',
        country: 'Rep. Dominicana',
        region: 'Cibao sin Santiago',
        nseLevel: 'Nivel 4',
        target: 85,
        achieved: 2,
        available: 83,
        active: true,
        notes: null,
        progressPct: 2,
        updatedAt: new Date(),
      },
      {
        id: 'c',
        country: 'Costa Rica',
        region: 'Area metropolitana I',
        nseLevel: 'Nivel 1',
        target: 0,
        achieved: 0,
        available: 0,
        active: true,
        notes: null,
        progressPct: 0,
        updatedAt: new Date(),
      },
    ]

    const buffer = await exportQuotaTargetsToWorkbook()
    const result = await importQuotaTargetsFromWorkbook(buffer)

    expect(result.unmatched).toEqual([])
    // 3 groups (country+region) x 4 NSE levels each = 12 upserts, even though only 3
    // (country, region, nseLevel) combinations had non-default data — the export fills
    // in the other 3 levels per group as 0, same as the real Excel's explicit-zero rows.
    expect(result.imported).toBe(12)

    for (const original of mockedProgress) {
      const reimported = upsertCalls.find(
        (c) => c.country === original.country && c.region === original.region && c.nseLevel === original.nseLevel,
      )
      expect(reimported).toMatchObject({ targetCount: original.target })
    }
  })
})
