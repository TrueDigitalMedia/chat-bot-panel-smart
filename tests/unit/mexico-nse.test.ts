import { describe, it, expect } from 'vitest'
import { computeMexicoNse } from '@/lib/scoring/mexico-nse'

// Vectors from specs/015-mexico-onboarding/contracts/mexico-nse-scoring.md. Option strings
// must match the callback_data values in src/lib/countries/mexico.ts; `bedrooms` is a
// typed integer column (bucketed to "4 o más" at >=4 inside computeMexicoNse).

describe('computeMexicoNse — workbook sample', () => {
  it('Primaria completa + 1 baño + 0 autos + sin internet + 3 trabajaron + 3 cuartos -> 105 / D+', () => {
    const result = computeMexicoNse({
      educationHoh: 'Primaria completa',
      fullBathrooms: '1',
      vehicleCount: '0',
      homeInternet: 'No tiene',
      workers14Plus: '3',
      bedrooms: 3,
    })
    expect(result.points).toBe(105)
    expect(result.level).toBe('D+')
  })
})

describe('computeMexicoNse — level-band boundaries', () => {
  it.each([
    [99, 'D/E', { educationHoh: 'Sin instrucción escolar', fullBathrooms: '0', vehicleCount: '1', homeInternet: 'No tiene', workers14Plus: '4 o más', bedrooms: 2 }],
    [100, 'D+', { educationHoh: 'Sin instrucción escolar', fullBathrooms: '0', vehicleCount: '1', homeInternet: 'No tiene', workers14Plus: '3', bedrooms: 4 }],
    [140, 'D+', { educationHoh: 'Sin instrucción escolar', fullBathrooms: '1', vehicleCount: '1', homeInternet: 'Sí tiene', workers14Plus: '3', bedrooms: 2 }],
    [141, 'C', { educationHoh: 'Sin instrucción escolar', fullBathrooms: '1', vehicleCount: '0', homeInternet: 'Sí tiene', workers14Plus: '4 o más', bedrooms: 3 }],
    [167, 'C', { educationHoh: 'Sin instrucción escolar', fullBathrooms: '2 o más', vehicleCount: '2 o más', homeInternet: 'No tiene', workers14Plus: '4 o más', bedrooms: 2 }],
    [168, 'C+', { educationHoh: 'Sin instrucción escolar', fullBathrooms: '0', vehicleCount: '2 o más', homeInternet: 'Sí tiene', workers14Plus: '4 o más', bedrooms: 4 }],
    [201, 'C+', { educationHoh: 'Secundaria completa', fullBathrooms: '2 o más', vehicleCount: '2 o más', homeInternet: 'No tiene', workers14Plus: '4 o más', bedrooms: 4 }],
    [202, 'AB', { educationHoh: 'Primaria completa', fullBathrooms: '2 o más', vehicleCount: '2 o más', homeInternet: 'Sí tiene', workers14Plus: '4 o más', bedrooms: 1 }],
  ] as const)('sums to %d -> %s', (points, level, answers) => {
    const result = computeMexicoNse(answers)
    expect(result.points).toBe(points)
    expect(result.level).toBe(level)
  })
})

describe('computeMexicoNse — missing / unknown', () => {
  it('empty answers -> 0 / D/E', () => {
    expect(computeMexicoNse({})).toMatchObject({ points: 0, level: 'D/E' })
  })

  it('null/undefined fields treated as 0', () => {
    const result = computeMexicoNse({
      educationHoh: null,
      fullBathrooms: undefined,
      vehicleCount: null,
      homeInternet: null,
      workers14Plus: null,
      bedrooms: null,
    })
    expect(result.points).toBe(0)
  })

  it('an unrecognized option contributes 0 rather than throwing', () => {
    const result = computeMexicoNse({ educationHoh: 'No sé, no recuerdo' })
    expect(result.points).toBe(0)
    expect(result.contributions.educationHoh).toBe(0)
  })

  it('bedrooms >= 4 all bucket to the "4 o más" value (32)', () => {
    for (const n of [4, 5, 8, 12]) {
      expect(computeMexicoNse({ bedrooms: n }).contributions.bedrooms).toBe(32)
    }
  })

  it('the Código Postal answer is not a scoring variable', () => {
    // codigoPostal is captured for the geo fallback only — passing it changes nothing.
    const withCp = computeMexicoNse({ educationHoh: 'Licenciatura completa', codigoPostal: '06700' } as never)
    const without = computeMexicoNse({ educationHoh: 'Licenciatura completa' })
    expect(withCp.points).toBe(without.points)
  })
})

describe('computeMexicoNse — per-variable point tables (contract spot checks)', () => {
  it.each([
    ['educationHoh', 'Posgrado completo', 85],
    ['educationHoh', 'Licenciatura completa', 59],
    ['fullBathrooms', '2 o más', 47],
    ['vehicleCount', '1', 22],
    ['homeInternet', 'Sí tiene', 32],
    ['workers14Plus', '4 o más', 61],
  ] as const)('%s = %s -> %d', (field, value, expected) => {
    const result = computeMexicoNse({ [field]: value })
    expect(result.contributions[field]).toBe(expected)
    expect(result.points).toBe(expected)
  })
})

// >=20 constructed households toward SC-002 — sweeps education x workers with a fixed
// baseline, asserting the resolved level always matches the cutoff bands.
describe('computeMexicoNse — constructed household sweep (SC-002)', () => {
  const educationOptions = [
    'Sin instrucción escolar',
    'Primaria completa',
    'Secundaria completa',
    'Prepa/Bachillerato/Carrera completa',
    'Licenciatura completa',
    'Posgrado completo',
  ]
  const workerOptions = ['0', '1', '2', '3', '4 o más']
  const households: Record<string, unknown>[] = []
  for (const educationHoh of educationOptions) {
    for (const workers14Plus of workerOptions) {
      households.push({ educationHoh, workers14Plus, fullBathrooms: '1', vehicleCount: '1', homeInternet: 'Sí tiene', bedrooms: 2 })
    }
  }

  it('constructs at least 20 households', () => {
    expect(households.length).toBeGreaterThanOrEqual(20)
  })

  it.each(households.map((h, i) => [i, h] as const))('household #%d level matches its point total', (_i, answers) => {
    const { points, level } = computeMexicoNse(answers)
    if (points <= 99) expect(level).toBe('D/E')
    else if (points <= 140) expect(level).toBe('D+')
    else if (points <= 167) expect(level).toBe('C')
    else if (points <= 201) expect(level).toBe('C+')
    else expect(level).toBe('AB')
  })
})
