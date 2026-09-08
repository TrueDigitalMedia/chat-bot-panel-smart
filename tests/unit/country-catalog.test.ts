import { describe, expect, it } from 'vitest'
import {
  isSupportedGeoCountry,
  validateCountryDepartment,
  validateCountryMunicipality,
  validateCountryGeoField,
} from '@/lib/geo/country-catalog'

// Generic province/municipality validator — covers the 6 non-Guatemala CAM countries plus
// Ecuador (spec 014) and México (spec 015). Modeled on tests/unit/guatemala-geo.test.ts.

describe('isSupportedGeoCountry', () => {
  it.each([
    ['Ecuador', true],
    ['México', true],
    ['Panamá', true],
    ['Costa Rica', true],
    ['Rep. Dominicana', true],
    ['Guatemala', false],
    ['Brasil', false],
    ['', false],
  ])('%s -> %s', (country, expected) => {
    expect(isSupportedGeoCountry(country)).toBe(expected)
  })
})

describe('Ecuador geo validation', () => {
  it('accepts an exact provincia without confirmation', () => {
    const r = validateCountryDepartment('Ecuador', 'Guayas')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Guayas')
    expect(r.needsConfirmation).toBe(false)
  })

  it('matches a provincia case- and accent-insensitively', () => {
    const r = validateCountryDepartment('Ecuador', 'pichincha')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Pichincha')
    expect(r.needsConfirmation).toBe(false)
  })

  it('rejects a cantón typed as a provincia (the original bug), with examples', () => {
    const r = validateCountryDepartment('Ecuador', 'Guayaquil')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Ejemplos:')
  })

  it('asks confirmation for a provincia typo', () => {
    const r = validateCountryDepartment('Ecuador', 'Guayaz')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Guayas')
    expect(r.needsConfirmation).toBe(true)
    expect(r.score).toBeLessThan(1)
  })

  it('accepts a cantón that belongs to the answered provincia', () => {
    const r = validateCountryMunicipality('Ecuador', 'Guayaquil', 'Guayas')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Guayaquil')
    expect(r.needsConfirmation).toBe(false)
  })

  it('rejects a cantón from a different provincia', () => {
    const r = validateCountryMunicipality('Ecuador', 'Guayaquil', 'Pichincha')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Ejemplos:')
  })

  it('rejects an unknown cantón with examples', () => {
    const r = validateCountryMunicipality('Ecuador', 'Narnia', 'Guayas')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Ejemplos:')
  })

  it('rejects a cantón when the provincia is unresolved', () => {
    const r = validateCountryMunicipality('Ecuador', 'Guayaquil', 'Nowhere')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Primero necesito')
  })

  it('validateCountryGeoField dispatches by field', () => {
    expect(validateCountryGeoField('Ecuador', 'stateProvince', 'Azuay', {}).canonical).toBe('Azuay')
    expect(
      validateCountryGeoField('Ecuador', 'municipality', 'Cuenca', { stateProvince: 'Azuay' }).ok,
    ).toBe(true)
  })
})

describe('México geo validation', () => {
  it('accepts an exact estado without confirmation', () => {
    const r = validateCountryDepartment('México', 'Jalisco')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Jalisco')
    expect(r.needsConfirmation).toBe(false)
  })

  it('keeps connector words lowercase in a multi-word estado name (preserveLevel1Case)', () => {
    const r = validateCountryDepartment('México', 'michoacan de ocampo')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Michoacán de Ocampo') // not "Michoacán De Ocampo"
  })

  it('resolves the estado literally named "México" distinctly from the country', () => {
    const r = validateCountryDepartment('México', 'México')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('México')
  })

  it('accepts a municipio within its estado', () => {
    const r = validateCountryMunicipality('México', 'Guadalajara', 'Jalisco')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Guadalajara')
    expect(r.needsConfirmation).toBe(false)
  })

  it('rejects a municipio from a different estado', () => {
    const r = validateCountryMunicipality('México', 'Coyoacán', 'Jalisco')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Ejemplos:')
  })

  it('rejects an unknown estado with examples', () => {
    const r = validateCountryDepartment('México', 'Texas')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Ejemplos:')
  })
})
