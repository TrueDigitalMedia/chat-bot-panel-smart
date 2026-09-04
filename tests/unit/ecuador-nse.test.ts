import { describe, it, expect } from 'vitest'
import { computeEcuadorNse } from '@/lib/scoring/ecuador-nse'

// Test vectors from specs/014-ecuador-onboarding/contracts/ecuador-nse-scoring.md.
// All option strings must match the callback_data values in src/lib/countries/ecuador.ts
// exactly — they're looked up verbatim in data/scoring/ecuador-nse.json.

describe('computeEcuadorNse — workbook sample household', () => {
  it('sums to 58 points -> level C (workbook shows 52 only because its own Acabados cell is blank)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Issfa (militares) Gobierno',
      monthlyIncome: 'De $701 hasta $1.000',
      dwellingFinishes: 'Casa de Cemento Techo de Eternit o Zinc',
      floorMaterial: 'Ladrillo o cemento',
      vehicleCount: '0',
      occupationHead: 'Técnicos y profesionales de nivel medio',
      educationPsh: 'Universidad completa',
      internetAccess: 'Internet Hogar contratado (Fibra Op)',
    })
    expect(result.points).toBe(58)
    expect(result.level).toBe('C')
  })
})

describe('computeEcuadorNse — level-band boundaries', () => {
  it('50 points -> D/E (lower boundary, not C)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '0',
      occupationHead: 'Trabajadores no calificados',
      educationPsh: 'Universidad incompleta',
      internetAccess: 'No internet',
    })
    expect(result.points).toBe(50)
    expect(result.level).toBe('D/E')
  })

  it('51 points -> C (one point over the D/E ceiling)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '0',
      occupationHead: 'Desocupados',
      educationPsh: 'Universidad incompleta',
      internetAccess: 'No internet',
    })
    expect(result.points).toBe(51)
    expect(result.level).toBe('C')
  })

  it('75 points -> C (upper boundary, not AB)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Casa de Cemento/Ladrillo Techo de Loza o Teja',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationHead: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Técnica completa',
      internetAccess: 'Internet (de Celular)',
    })
    expect(result.points).toBe(75)
    expect(result.level).toBe('C')
  })

  it('76 points -> AB (one point over the C ceiling)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Casa de Cemento/Ladrillo Techo de Loza o Teja',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationHead: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Media completa',
      internetAccess: 'Internet Hogar contratado (cable)',
    })
    expect(result.points).toBe(76)
    expect(result.level).toBe('AB')
  })
})

describe('computeEcuadorNse — missing/unknown answers', () => {
  it('an empty answers object -> 0 points, D/E', () => {
    const result = computeEcuadorNse({})
    expect(result.points).toBe(0)
    expect(result.level).toBe('D/E')
  })

  it('null/undefined per-field answers are treated as 0, same as missing', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: null,
      monthlyIncome: undefined,
      dwellingFinishes: null,
      floorMaterial: null,
      vehicleCount: null,
      occupationHead: null,
      occupationAma: null,
      educationPsh: null,
      internetAccess: null,
    })
    expect(result.points).toBe(0)
    expect(result.level).toBe('D/E')
  })

  it('an unrecognized option string contributes 0 rather than throwing', () => {
    const result = computeEcuadorNse({ healthInsurancePsh: 'No sé, no recuerdo' })
    expect(result.points).toBe(0)
    expect(result.contributions.healthInsurancePsh).toBe(0)
  })
})

describe('computeEcuadorNse — occupation is max(head, ama), counted once', () => {
  it('occupationAma outscoring occupationHead contributes the higher value, not both', () => {
    const result = computeEcuadorNse({
      occupationHead: 'Trabajadores no calificados', // 0
      occupationAma: 'Profesionales científicos e intelectuales', // 12
    })
    expect(result.contributions.occupation).toBe(12)
    expect(result.points).toBe(12)
  })

  it('occupationHead outscoring occupationAma contributes the head value', () => {
    const result = computeEcuadorNse({
      occupationHead: 'Personal directivo de la Administración Pública y de empresas', // 13
      occupationAma: 'Trabajadores no calificados', // 0
    })
    expect(result.contributions.occupation).toBe(13)
  })

  it('both unanswered contributes 0 for occupation', () => {
    const result = computeEcuadorNse({})
    expect(result.contributions.occupation).toBe(0)
  })
})

describe('computeEcuadorNse — per-variable point tables (contract spot checks)', () => {
  it.each([
    ['healthInsurancePsh', 'Ninguno', 0],
    ['healthInsurancePsh', 'IESS', 2],
    ['healthInsurancePsh', 'Isspol (policías)', 6],
    ['healthInsurancePsh', 'Privada', 10],
    ['monthlyIncome', 'Hasta $400', 1],
    ['monthlyIncome', 'De $2.001 hasta $3.000', 5],
    ['dwellingFinishes', 'Casa de Tabla/Madera techo de Desechos o cartón', 0],
    ['floorMaterial', 'Otros materiales', 0],
    ['floorMaterial', 'Cerámica, baldosa, vinil o marmetón', 7],
    ['vehicleCount', '3', 12],
    ['educationPsh', 'Post grado completo', 20],
    ['internetAccess', 'Internet Hogar contratado (cable)', 8],
  ] as const)('%s = %s -> %d points', (field, value, expected) => {
    const result = computeEcuadorNse({ [field]: value })
    expect(result.contributions[field]).toBe(expected)
    expect(result.points).toBe(expected)
  })
})

// >=20 constructed households toward SC-002 — sweeps every health/income/floor value
// paired with a fixed rest-of-answers baseline, asserting the resolved level always
// matches the levelCutoffs bands (D/E <=50, C 51-75, AB >=76) rather than pinning exact
// point totals (which would duplicate the boundary tests above).
describe('computeEcuadorNse — constructed household sweep (SC-002)', () => {
  const baseline = {
    dwellingFinishes: 'Casa de Cemento Techo de Eternit o Zinc',
    floorMaterial: 'Ladrillo o cemento',
    vehicleCount: '1',
    occupationHead: 'Empleados de oficina',
    educationPsh: 'Básica completa',
    internetAccess: 'Internet (de Celular)',
  }
  const healthOptions = ['Ninguno', 'IESS', 'Issfa (militares) Gobierno', 'Isspol (policías)', 'Privada']
  const incomeOptions = [
    'Hasta $400',
    'De $401 hasta $700',
    'De $701 hasta $1.000',
    'De $1.001 hasta $2.000',
    'De $2.001 hasta $3.000',
    'Más de $3.000',
  ]

  const households: Record<string, string>[] = []
  for (const health of healthOptions) {
    for (const income of incomeOptions) {
      households.push({ ...baseline, healthInsurancePsh: health, monthlyIncome: income })
    }
  }

  it('constructs at least 20 households', () => {
    expect(households.length).toBeGreaterThanOrEqual(20)
  })

  it.each(households.map((h, i) => [i, h] as const))(
    'household #%d resolves to a level consistent with its point total',
    (_i, answers) => {
      const result = computeEcuadorNse(answers)
      if (result.points <= 50) expect(result.level).toBe('D/E')
      else if (result.points <= 75) expect(result.level).toBe('C')
      else expect(result.level).toBe('AB')
    },
  )
})
