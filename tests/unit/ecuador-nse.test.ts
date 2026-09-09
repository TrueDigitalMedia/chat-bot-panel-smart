import { describe, it, expect } from 'vitest'
import { computeEcuadorNse } from '@/lib/scoring/ecuador-nse'

// Point tables from docs/ecuador/flujo_kantar_ecuador.md §5.1; level cutoffs from §5.2
// (official 5-level scale: A 91+, B 76–90, C 51–75, D 31–50, E 0–30). All option strings
// must match the callback_data values in src/lib/countries/ecuador.ts exactly — they're
// looked up verbatim in data/scoring/ecuador-nse.json.

describe('computeEcuadorNse — workbook sample household', () => {
  it('sums to 58 points -> level C', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Issfa (militares) Gobierno',
      monthlyIncome: 'De $701 hasta $1.000',
      dwellingFinishes: 'Casa de Cemento Techo de Eternit o Zinc',
      floorMaterial: 'Ladrillo o cemento',
      vehicleCount: '0',
      occupationPsh: 'Técnicos y profesionales de nivel medio',
      educationPsh: 'Universidad completa',
      internetAccess: 'Internet Hogar contratado (Fibra Op)',
    })
    expect(result.points).toBe(58)
    expect(result.level).toBe('C')
  })
})

describe('computeEcuadorNse — level-band boundaries (5-level scale)', () => {
  it('30 points -> E (upper boundary of E)', () => {
    // 10 (privada) + 6 (>$3.000) + 12 (otro) + 2 (tierra/caña) + 0 + 0 + 0 + 0 = 30
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Tierra/Caña',
      vehicleCount: '0',
      occupationPsh: 'Trabajadores no calificados',
      educationPsh: 'Ninguno- No alfabetizado',
      internetAccess: 'No internet',
    })
    expect(result.points).toBe(30)
    expect(result.level).toBe('E')
  })

  it('31 points -> D (one point over the E ceiling)', () => {
    // ...same as above but floorMaterial Ladrillo o cemento (4) instead of Tierra/Caña (2) => 32
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Cerámica, baldosa, vinil o marmetón', // 7 => total 35
      vehicleCount: '0',
      occupationPsh: 'Trabajadores no calificados',
      educationPsh: 'Ninguno- No alfabetizado',
      internetAccess: 'No internet',
    })
    expect(result.points).toBe(35)
    expect(result.level).toBe('D')
  })

  it('50 points -> D (upper boundary, not C)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '0',
      occupationPsh: 'Trabajadores no calificados',
      educationPsh: 'Universidad incompleta',
      internetAccess: 'No internet',
    })
    expect(result.points).toBe(50)
    expect(result.level).toBe('D')
  })

  it('51 points -> C (one point over the D ceiling)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '0',
      occupationPsh: 'Desocupados',
      educationPsh: 'Universidad incompleta',
      internetAccess: 'No internet',
    })
    expect(result.points).toBe(51)
    expect(result.level).toBe('C')
  })

  it('75 points -> C (upper boundary, not B)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Casa de Cemento/Ladrillo Techo de Loza o Teja',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationPsh: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Técnica completa',
      internetAccess: 'Internet (de Celular)',
    })
    expect(result.points).toBe(75)
    expect(result.level).toBe('C')
  })

  it('76 points -> B (one point over the C ceiling)', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Casa de Cemento/Ladrillo Techo de Loza o Teja',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationPsh: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Media completa',
      internetAccess: 'Internet Hogar contratado (cable)',
    })
    expect(result.points).toBe(76)
    expect(result.level).toBe('B')
  })

  it('90 points -> B (upper boundary, not A)', () => {
    // 10 + 6 + 12 + 10 + 14 + 13 + 10 + 15 = 90
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationPsh: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Técnica completa',
      internetAccess: 'Internet Hogar contratado (Fibra Op)',
    })
    expect(result.points).toBe(90)
    expect(result.level).toBe('B')
  })

  it('91 points -> A (one point over the B ceiling)', () => {
    // ...education Universidad incompleta (12) instead of Técnica completa (10) => 92
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationPsh: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Universidad incompleta',
      internetAccess: 'Internet Hogar contratado (Fibra Op)',
    })
    expect(result.points).toBe(92)
    expect(result.level).toBe('A')
  })

  it('100 points (theoretical max) -> A', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: 'Privada',
      monthlyIncome: 'Más de $3.000',
      dwellingFinishes: 'Otro (acabados de lujo)',
      floorMaterial: 'Duela, parquet, tablón o piso flotante',
      vehicleCount: '4 o más',
      occupationPsh: 'Personal directivo de la Administración Pública y de empresas',
      educationPsh: 'Post grado completo',
      internetAccess: 'Internet Hogar contratado (Fibra Op)',
    })
    expect(result.points).toBe(100)
    expect(result.level).toBe('A')
  })
})

describe('computeEcuadorNse — missing/unknown answers', () => {
  it('an empty answers object -> 0 points, E', () => {
    const result = computeEcuadorNse({})
    expect(result.points).toBe(0)
    expect(result.level).toBe('E')
  })

  it('null/undefined per-field answers are treated as 0, same as missing', () => {
    const result = computeEcuadorNse({
      healthInsurancePsh: null,
      monthlyIncome: undefined,
      dwellingFinishes: null,
      floorMaterial: null,
      vehicleCount: null,
      occupationPsh: null,
      educationPsh: null,
      internetAccess: null,
    })
    expect(result.points).toBe(0)
    expect(result.level).toBe('E')
  })

  it('an unrecognized option string contributes 0 rather than throwing', () => {
    const result = computeEcuadorNse({ healthInsurancePsh: 'No sé, no recuerdo' })
    expect(result.points).toBe(0)
    expect(result.contributions.healthInsurancePsh).toBe(0)
  })
})

describe('computeEcuadorNse — single PSH occupation (doc Q19)', () => {
  it('scores the one occupationPsh answer', () => {
    const result = computeEcuadorNse({
      occupationPsh: 'Profesionales científicos e intelectuales', // 12
    })
    expect(result.contributions.occupation).toBe(12)
    expect(result.points).toBe(12)
  })

  it('unanswered contributes 0 for occupation', () => {
    const result = computeEcuadorNse({})
    expect(result.contributions.occupation).toBe(0)
  })
})

describe('computeEcuadorNse — per-variable point tables (spot checks)', () => {
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

// >=20 constructed households — sweeps every health/income value paired with a fixed
// rest-of-answers baseline, asserting the resolved level always matches the 5-level
// levelCutoffs bands rather than pinning exact point totals.
describe('computeEcuadorNse — constructed household sweep', () => {
  const baseline = {
    dwellingFinishes: 'Casa de Cemento Techo de Eternit o Zinc',
    floorMaterial: 'Ladrillo o cemento',
    vehicleCount: '1',
    occupationPsh: 'Empleados de oficina',
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
      if (result.points <= 30) expect(result.level).toBe('E')
      else if (result.points <= 50) expect(result.level).toBe('D')
      else if (result.points <= 75) expect(result.level).toBe('C')
      else if (result.points <= 90) expect(result.level).toBe('B')
      else expect(result.level).toBe('A')
    },
  )
})
