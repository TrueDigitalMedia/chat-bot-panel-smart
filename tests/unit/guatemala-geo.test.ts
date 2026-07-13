import { describe, expect, it } from 'vitest'
import {
  validateGuatemalaDepartment,
  validateGuatemalaMunicipality,
  validateGuatemalaNeighborhood,
} from '@/lib/geo/guatemala'

describe('Guatemala geo validation', () => {
  it('accepts exact departamento without confirmation', () => {
    const r = validateGuatemalaDepartment('Guatemala')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Guatemala')
    expect(r.needsConfirmation).toBe(false)
  })

  it('accepts departamento with accents stripped without confirmation', () => {
    const r = validateGuatemalaDepartment('sacatepequez')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Sacatepéquez')
    expect(r.needsConfirmation).toBe(false)
  })

  it('rejects unknown departamento', () => {
    const r = validateGuatemalaDepartment('California')
    expect(r.ok).toBe(false)
  })

  it('accepts exact municipio without confirmation', () => {
    const r = validateGuatemalaMunicipality('Mixco', 'Guatemala')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Mixco')
    expect(r.needsConfirmation).toBe(false)
  })

  it('asks confirmation for typo/spacing like "mix co"', () => {
    const r = validateGuatemalaMunicipality('mix co', 'Guatemala')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Mixco')
    expect(r.needsConfirmation).toBe(true)
    expect(r.score).toBeLessThan(1)
  })

  it('accepts municipio within departamento', () => {
    const r = validateGuatemalaMunicipality('Antigua Guatemala', 'Sacatepéquez')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Antigua Guatemala')
    expect(r.needsConfirmation).toBe(false)
  })

  it('rejects municipio from another departamento', () => {
    const r = validateGuatemalaMunicipality('Cobán', 'Sacatepéquez')
    expect(r.ok).toBe(false)
  })

  it('accepts capital zona', () => {
    const r = validateGuatemalaNeighborhood('zona 10', 'Guatemala')
    expect(r.ok).toBe(true)
    expect(r.canonical).toBe('Zona 10')
    expect(r.needsConfirmation).toBe(false)
  })

  it('rejects invalid capital zona', () => {
    const r = validateGuatemalaNeighborhood('Zona 99', 'Guatemala')
    expect(r.ok).toBe(false)
  })

  it('accepts barrio outside capital', () => {
    const r = validateGuatemalaNeighborhood('Centro', 'Antigua Guatemala')
    expect(r.ok).toBe(true)
  })
})
