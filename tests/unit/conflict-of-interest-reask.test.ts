import { describe, it, expect } from 'vitest'
import {
  CONFLICT_OF_INTEREST_RECONFIRM,
  FICHA_HOGAR_QUESTIONS,
  MEXICO_FICHA_HOGAR_QUESTIONS,
  ECUADOR_FICHA_HOGAR_QUESTIONS,
} from '@/lib/conversation/ficha-hogar-questions'

const SECTORS = [
  'Agencia de publicidad',
  'investigación de mercados',
  'Radio, periódico o televisión',
  'alimentos, bebidas, higiene personal, limpieza del hogar, ropa o calzado',
]

describe('conflicto de interés — texto enumerado y repregunta', () => {
  it('la pregunta de CAM enumera los cuatro sectores en vez de resumirlos', () => {
    const q = FICHA_HOGAR_QUESTIONS[0]
    expect(q.fieldName).toBe('conflictOfInterest')
    for (const sector of SECTORS) expect(q.text).toContain(sector)
    // El resumen viejo ("la industria alimentaria") es el que se llevaba puesta a cualquiera
    // con una tienda o un comedor: 24-36% de descartes contra el 11% de Ecuador.
    expect(q.text).not.toContain('la industria alimentaria')
  })

  it('la repregunta enumera los sectores y aclara que el punto 4 es por ser dueño/a', () => {
    for (const sector of SECTORS) expect(CONFLICT_OF_INTEREST_RECONFIRM.text).toContain(sector)
    expect(CONFLICT_OF_INTEREST_RECONFIRM.text).toContain('dueño/a del negocio')
  })

  /**
   * El gate de phase-4 distingue el primer "sí" del segundo por
   * `ficha_hogar_profiles.conflict_of_interest_reasked`, NO por el callback. Si alguien le
   * cambiara el prefijo a estos botones, el lead que contesta escribiendo "si" dejaría de
   * resolverse contra la pregunta pendiente y quedaría en un bucle.
   */
  it('la repregunta reusa los mismos callbacks que la pregunta original', () => {
    const original = FICHA_HOGAR_QUESTIONS[0].buttons!.flat().map((b) => b.callback_data)
    const reconfirm = CONFLICT_OF_INTEREST_RECONFIRM.buttons.flat().map((b) => b.callback_data)
    expect(reconfirm).toEqual(original)
    expect(reconfirm).toEqual(['conflictOfInterest:true', 'conflictOfInterest:false'])
  })

  it('México y Ecuador conservan su propio texto — Ecuador es el que ya tenía la tasa más baja', () => {
    expect(MEXICO_FICHA_HOGAR_QUESTIONS[0].fieldName).toBe('conflictOfInterest')
    expect(ECUADOR_FICHA_HOGAR_QUESTIONS[0].fieldName).toBe('conflictOfInterest')
    expect(MEXICO_FICHA_HOGAR_QUESTIONS[0].text).not.toBe(FICHA_HOGAR_QUESTIONS[0].text)
    expect(ECUADOR_FICHA_HOGAR_QUESTIONS[0].text).not.toBe(FICHA_HOGAR_QUESTIONS[0].text)
  })
})
