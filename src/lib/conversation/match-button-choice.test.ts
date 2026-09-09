import { describe, it, expect } from 'vitest'
import { matchButtonChoice } from './match-button-choice'
import type { InlineKeyboardButton } from '@/types/telegram'

const b = (rows: [string, string][][]): InlineKeyboardButton[][] =>
  rows.map((r) => r.map(([text, callback_data]) => ({ text, callback_data })))

const CARS = b([[['0', 'cars:0'], ['1', 'cars:1'], ['2 o más', 'cars:2 o más']]])
const HH = b([[['1', 'householdSize:1'], ['2', 'householdSize:2'], ['3', 'householdSize:3']]])
const YESNO = b([[['Sí', 'd3:yes'], ['No', 'd3:no']]])
const OPTIN = b([[['Inscribirme', 'optin:accept'], ['No', 'optin:decline']]])
const DOMESTIC = b([[['Sí', 'domesticHelp:true'], ['No', 'domesticHelp:false']]])
const EDU = b([[['No alfabetizado', 'educationPsh:No alfabetizado'], ['Primaria', 'educationPsh:Primaria'], ['Secundaria', 'educationPsh:Secundaria']]])

describe('matchButtonChoice — numeric answers match by value, not position', () => {
  it('"1" on a 0/1/2 car list is one car', () => {
    expect(matchButtonChoice(CARS, '1')).toBe('cars:1')
    expect(matchButtonChoice(CARS, '2')).toBe('cars:2 o más')
    expect(matchButtonChoice(CARS, '0')).toBe('cars:0')
  })
  it('householdSize where value == position still works', () => {
    expect(matchButtonChoice(HH, '2')).toBe('householdSize:2')
  })
  it('falls back to 1-based position for a non-numeric option list', () => {
    expect(matchButtonChoice(EDU, '2')).toBe('educationPsh:Primaria')
  })
})

describe('matchButtonChoice — trivial yes/no/none words', () => {
  it('sí-words → the yes button', () => {
    for (const s of ['si', 'sí', 'sip', 'claro', 'dale', 'ok', 'correcto', 'acepto']) {
      expect(matchButtonChoice(YESNO, s)).toBe('d3:yes')
    }
    expect(matchButtonChoice(OPTIN, 'si')).toBe('optin:accept')
    expect(matchButtonChoice(DOMESTIC, 'claro')).toBe('domesticHelp:true')
  })
  it('no-words → the no button', () => {
    expect(matchButtonChoice(YESNO, 'no')).toBe('d3:no')
    expect(matchButtonChoice(OPTIN, 'nop')).toBe('optin:decline')
    expect(matchButtonChoice(DOMESTIC, 'no tengo')).toBe('domesticHelp:false')
  })
  it('"ninguno" / "no tengo" → the 0 button when there is one', () => {
    expect(matchButtonChoice(CARS, 'ninguno')).toBe('cars:0')
    expect(matchButtonChoice(CARS, 'no tengo')).toBe('cars:0')
    expect(matchButtonChoice(CARS, 'nada')).toBe('cars:0')
  })
  it('does not invent a yes/no match on a non-yes/no question', () => {
    expect(matchButtonChoice(EDU, 'si')).toBeNull()
    expect(matchButtonChoice(HH, 'no')).toBeNull()
  })
})

describe('matchButtonChoice — existing behaviour preserved', () => {
  it('exact label', () => {
    expect(matchButtonChoice(CARS, '2 o más')).toBe('cars:2 o más')
  })
  it('empty / junk → null', () => {
    expect(matchButtonChoice(YESNO, '')).toBeNull()
    expect(matchButtonChoice(YESNO, 'no me acuerdo')).toBeNull()
  })
})
