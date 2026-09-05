import { describe, it, expect, vi } from 'vitest'
import { countryCodeFor } from './country-codes'

describe('countryCodeFor', () => {
  it('maps all 7 survey country names to their code', () => {
    expect(countryCodeFor('Guatemala')).toBe('GT')
    expect(countryCodeFor('Honduras')).toBe('HN')
    expect(countryCodeFor('El Salvador')).toBe('SV')
    expect(countryCodeFor('Nicaragua')).toBe('NI')
    expect(countryCodeFor('Costa Rica')).toBe('CR')
    expect(countryCodeFor('Rep. Dominicana')).toBe('DO')
    expect(countryCodeFor('Panamá')).toBe('PA')
  })

  it('returns null and warns for an unrecognized name, without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(countryCodeFor('República Dominicana')).toBeNull()
    expect(countryCodeFor('Brasil')).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })

  it('returns null for null input without warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(countryCodeFor(null)).toBeNull()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
