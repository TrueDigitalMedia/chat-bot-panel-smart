import { describe, it, expect } from 'vitest'
import { matchButtonChoice } from '@/lib/conversation/match-button-choice'

const YES_NO = [
  [
    { text: 'Sí', callback_data: 'isPregnant:true' },
    { text: 'No', callback_data: 'isPregnant:false' },
  ],
]

describe('matchButtonChoice', () => {
  it('matches an accent-stripped, lowercase label (the reported bug: "si" for "Sí")', () => {
    expect(matchButtonChoice(YES_NO, 'si')).toBe('isPregnant:true')
    expect(matchButtonChoice(YES_NO, 'Si')).toBe('isPregnant:true')
    expect(matchButtonChoice(YES_NO, 'SI')).toBe('isPregnant:true')
    expect(matchButtonChoice(YES_NO, 'sí')).toBe('isPregnant:true')
  })

  it('matches "no" case-insensitively', () => {
    expect(matchButtonChoice(YES_NO, 'no')).toBe('isPregnant:false')
    expect(matchButtonChoice(YES_NO, 'No')).toBe('isPregnant:false')
  })

  it('matches leading/trailing whitespace', () => {
    expect(matchButtonChoice(YES_NO, '  si  ')).toBe('isPregnant:true')
  })

  it('matches by 1-based numeric position', () => {
    expect(matchButtonChoice(YES_NO, '1')).toBe('isPregnant:true')
    expect(matchButtonChoice(YES_NO, '2')).toBe('isPregnant:false')
  })

  it('returns null for an out-of-range numeric position', () => {
    expect(matchButtonChoice(YES_NO, '3')).toBeNull()
    expect(matchButtonChoice(YES_NO, '0')).toBeNull()
  })

  it('returns null for unrelated text', () => {
    expect(matchButtonChoice(YES_NO, 'tal vez')).toBeNull()
    expect(matchButtonChoice(YES_NO, 'hola')).toBeNull()
  })

  it('returns null for empty/whitespace-only input', () => {
    expect(matchButtonChoice(YES_NO, '')).toBeNull()
    expect(matchButtonChoice(YES_NO, '   ')).toBeNull()
  })

  it('works across multiple rows (flattens the keyboard)', () => {
    const multiRow = [
      [{ text: 'A', callback_data: 'x:a' }],
      [{ text: 'B', callback_data: 'x:b' }, { text: 'C', callback_data: 'x:c' }],
    ]
    expect(matchButtonChoice(multiRow, 'c')).toBe('x:c')
    expect(matchButtonChoice(multiRow, '3')).toBe('x:c')
  })

  it('matches labels with other accented characters (e.g. education level buttons)', () => {
    const buttons = [
      [
        { text: 'Educación básica', callback_data: 'educationPsh:basica' },
        { text: 'Educación media', callback_data: 'educationPsh:media' },
      ],
    ]
    expect(matchButtonChoice(buttons, 'educacion basica')).toBe('educationPsh:basica')
    expect(matchButtonChoice(buttons, 'EDUCACION MEDIA')).toBe('educationPsh:media')
  })
})
