import { describe, it, expect } from 'vitest'
import { salvageEmail, isNoEmailAnswer } from './email-answer'

describe('salvageEmail', () => {
  it('passes a clean address through (lowercased)', () => {
    expect(salvageEmail('marcosj751@gmail.com')).toBe('marcosj751@gmail.com')
    expect(salvageEmail('Karinalajefa51@gmail.com')).toBe('karinalajefa51@gmail.com')
  })

  it('strips internal / edge whitespace', () => {
    expect(salvageEmail('Xiomigonzalez@gmail. Com')).toBe('xiomigonzalez@gmail.com')
    expect(salvageEmail('Janny Rojas @gmail.com')).toBe('jannyrojas@gmail.com')
    expect(salvageEmail('Cecilia .Menjivar @hotmail .com')).toBe('cecilia.menjivar@hotmail.com')
  })

  it('fixes a comma-for-dot in the domain', () => {
    expect(salvageEmail('Ana125@gmail,com')).toBe('ana125@gmail.com')
  })

  it('supplies a missing TLD after a known provider', () => {
    expect(salvageEmail('Gamalielreyes701@gmail')).toBe('gamalielreyes701@gmail.com')
    expect(salvageEmail('Anayacristina233@gmail')).toBe('anayacristina233@gmail.com')
  })

  it('inserts a missing "@" before a known provider domain', () => {
    expect(salvageEmail('Cynthiaescalante237gmail.com')).toBe('cynthiaescalante237@gmail.com')
  })

  it('fixes common provider misspellings', () => {
    expect(salvageEmail('Ferdara2021@gemail.com')).toBe('ferdara2021@gmail.com')
    expect(salvageEmail('daguizramirezcarmen @Gmil.com')).toBe('daguizramirezcarmen@gmail.com')
  })

  it('pulls the address out of a labelled sentence', () => {
    expect(salvageEmail('Correo  lizcollad@gmail.com')).toBe('lizcollad@gmail.com')
    expect(salvageEmail('Correo electrónico es :\npedrorenelazo2024@gmail.com')).toBe('pedrorenelazo2024@gmail.com')
  })

  it('returns null for the genuinely unrecoverable', () => {
    expect(salvageEmail('@gmail.com')).toBeNull()
    expect(salvageEmail('Cp0625342@')).toBeNull()
    expect(salvageEmail('No tengo')).toBeNull()
    expect(salvageEmail('41')).toBeNull()
    expect(salvageEmail('')).toBeNull()
  })
})

describe('isNoEmailAnswer', () => {
  it('recognises "I do not have an email"', () => {
    for (const s of ['No tengo', 'No tengo correo', 'No tengo correo electrónico', 'no poseo correo', 'sin correo', 'Alguna otra cosa no tengo correo']) {
      expect(isNoEmailAnswer(s)).toBe(true)
    }
  })

  it('does not swallow an actual address or an unrelated "no"', () => {
    expect(isNoEmailAnswer('x@gmail.com')).toBe(false)
    expect(isNoEmailAnswer('no')).toBe(false)
    expect(isNoEmailAnswer('Managua')).toBe(false)
    expect(isNoEmailAnswer('no me gusta')).toBe(false)
  })
})
