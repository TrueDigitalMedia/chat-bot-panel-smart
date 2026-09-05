import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import type { QuotaProgress } from '@/lib/quotas/quota-progress'

interface UpsertCall {
  country: string
  region: string
  dimensionType: string
  dimensionValue: string
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

function buildWorkbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// Mirrors the real layout of docs/Muestra Faltante por País Julio 2026_True.xlsx (confirmed
// by inspecting the workbook directly — see research.md R6/R7).
const HONDURAS_HEADER_ROWS: unknown[][] = [
  Array(13).fill(''),
  ['', '', 'Honduras', '', '', '', '', '', '', '', '', '', ''],
  ['', '', 'NSE', '', '', '', '', 'Edad', '', '', 'Integrantes', '', ''],
  ['', '', 'SCL1', 'SCL2', 'SCL3', 'SCL4', 'Embarazadas y bebés Hasta 36 m', 'Hasta 34', '35 a 49', '50+', '1 a 2', '3 a 4', '5+'],
]

describe('importQuotaTargetsFromWorkbook — per-dimension layout (spec 011)', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('imports Honduras Nor Occidente I exactly as in the business example: SCL1/50+ exhausted, integrantes 5+ available', async () => {
    const buf = buildWorkbook({
      Honduras: [
        ...HONDURAS_HEADER_ROWS,
        ['', 'Nor Occidente I / Honduras', 0, 0, 0, 29, '', 11, 0, 0, 0, 0, 22],
      ],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.unmatched).toEqual([])
    // 4 NSE + 3 edad + 3 integrantes = 10 cells; "Embarazadas" column is never imported.
    expect(result.imported).toBe(10)

    expect(upsertCalls).toContainEqual({
      country: 'Honduras',
      region: 'Nor Occidente I',
      dimensionType: 'integrantes',
      dimensionValue: '5+',
      targetCount: 22,
    })
    expect(upsertCalls).toContainEqual({
      country: 'Honduras',
      region: 'Nor Occidente I',
      dimensionType: 'nse',
      dimensionValue: 'Nivel 1',
      targetCount: 0,
    })
    expect(upsertCalls).toContainEqual({
      country: 'Honduras',
      region: 'Nor Occidente I',
      dimensionType: 'edad',
      dimensionValue: '50+',
      targetCount: 0,
    })
  })

  it('imports Honduras Centro I: SCL4 available, edad/integrantes exhausted', async () => {
    const buf = buildWorkbook({
      Honduras: [...HONDURAS_HEADER_ROWS, ['', 'Centro I / Honduras', 0, 1, 5, 16, '', 8, 0, 2, 10, 0, 18]],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.unmatched).toEqual([])
    expect(upsertCalls).toContainEqual({
      country: 'Honduras',
      region: 'Centro I',
      dimensionType: 'nse',
      dimensionValue: 'Nivel 4',
      targetCount: 16,
    })
  })

  it('does not import the "Embarazadas y bebés" column as a quota target', async () => {
    const buf = buildWorkbook({
      Honduras: [...HONDURAS_HEADER_ROWS, ['', 'Centro I / Honduras', 0, 1, 5, 16, '', 8, 0, 2, 10, 0, 18]],
    })
    await importQuotaTargetsFromWorkbook(buf)
    expect(upsertCalls.some((c) => c.dimensionType !== 'nse' && c.dimensionType !== 'edad' && c.dimensionType !== 'integrantes')).toBe(
      false,
    )
    expect(upsertCalls).toHaveLength(10)
  })

  it('maps the "Dominicana" sheet name to Rep. Dominicana', async () => {
    const buf = buildWorkbook({
      Dominicana: [
        Array(13).fill(''),
        ['', '', 'Republica Dominicana', '', '', '', '', '', '', '', '', '', ''],
        ['', '', 'NSE', '', '', '', '', 'Edad', '', '', 'Integrantes', '', ''],
        ['', '', 'SCL1', 'SCL2', 'SCL3', 'SCL4', 'Embarazadas y bebés Hasta 36 m', 'Hasta 34', '35 a 49', '50+', '1 a 2', '3 a 4', '5+'],
        ['', 'Suroeste / Rep Dominicana', 0, 30, 34, 15, '', 1, 17, 52, 34, 2, 34],
      ],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.unmatched).toEqual([])
    expect(upsertCalls[0]).toMatchObject({ country: 'Rep. Dominicana', region: 'Suroeste' })
  })

  it('reports an unrecognized country (sheet) in unmatched, without importing anything from it', async () => {
    const buf = buildWorkbook({
      Brasil: [...HONDURAS_HEADER_ROWS, ['', 'Norte / Brasil', 0, 0, 0, 10, '', 0, 0, 0, 0, 0, 0]],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(0)
    expect(result.unmatched).toEqual([{ row: 'Brasil', reason: 'country_not_recognized' }])
  })

  it('reports an unrecognized region in unmatched, without upserting anything for that row', async () => {
    const buf = buildWorkbook({
      Honduras: [...HONDURAS_HEADER_ROWS, ['', 'Region Inventada / Honduras', 0, 0, 0, 10, '', 0, 0, 0, 0, 0, 0]],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(0)
    expect(result.unmatched).toEqual([{ row: 'Honduras: Region Inventada / Honduras', reason: 'region_not_recognized' }])
  })

  it('skips header/blank/total rows (no " / " label) without treating them as data', async () => {
    const buf = buildWorkbook({
      Honduras: [
        ...HONDURAS_HEADER_ROWS,
        ['', 'Centro I / Honduras', 0, 1, 5, 16, '', 8, 0, 2, 10, 0, 18],
        ['', '', 0, 1, 5, 16, '', 8, 0, 2, 10, 0, 18], // totals row — no label
      ],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(10)
    expect(result.unmatched).toEqual([])
  })

  it('imports a target of 0 explicitly (a real, meaningful value — not skipped)', async () => {
    const buf = buildWorkbook({
      Honduras: [...HONDURAS_HEADER_ROWS, ['', 'Centro I / Honduras', 0, 0, 0, 0, '', 0, 0, 0, 0, 0, 0]],
    })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(10)
    expect(upsertCalls.every((c) => c.targetCount === 0)).toBe(true)
  })

  it('skips sheets with no recognizable header instead of throwing', async () => {
    const buf = buildWorkbook({ OtroSheet: [['x']] })
    const result = await importQuotaTargetsFromWorkbook(buf)
    expect(result.imported).toBe(0)
    expect(result.unmatched).toEqual([{ row: 'OtroSheet', reason: 'country_not_recognized' }])
  })
})

describe('round-trip: export(state) → import(that file) reproduces the same targets', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('re-imports the exact country/region/dimensionType/dimensionValue/targetCount for every configured cell', async () => {
    mockedProgress = [
      {
        id: 'a',
        country: 'Guatemala',
        region: 'Sur Occidente Chico',
        dimensionType: 'nse',
        dimensionValue: 'Nivel 2',
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
        dimensionType: 'integrantes',
        dimensionValue: '5+',
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
        dimensionType: 'edad',
        dimensionValue: '50+',
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
    expect(result.imported).toBe(mockedProgress.length)

    for (const original of mockedProgress) {
      const reimported = upsertCalls.find(
        (c) =>
          c.country === original.country &&
          c.region === original.region &&
          c.dimensionType === original.dimensionType &&
          c.dimensionValue === original.dimensionValue,
      )
      expect(reimported).toMatchObject({ targetCount: original.target })
    }
  })
})
