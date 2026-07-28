import { describe, it, expect } from 'vitest'
import { applyTdmTestModeOverrides, TDM_TEST_PHONE, TDM_TEST_EMAIL } from './test-mode'
import type { RegistrationCodeRequestPayload } from './types'

function basePayload(overrides: Partial<RegistrationCodeRequestPayload> = {}): RegistrationCodeRequestPayload {
  return {
    lead_id: 'lead-1',
    canal: 'WhatsApp',
    pais_codigo: 'GT',
    pais_residencia: 'Guatemala',
    nombre_completo: 'Juan Pérez',
    telefono: '+50255550000',
    correo_electronico: 'juan@example.com',
    region: 'Centro II',
    departamento_provincia: 'Guatemala',
    municipio_canton: 'Mixco',
    barrio_parroquia: 'Zona 10',
    metodo_contacto_preferido: 'WhatsApp',
    horario_contacto_preferido: 'Noche (18-21hs)',
    fecha_nacimiento: null,
    ...overrides,
  }
}

describe('applyTdmTestModeOverrides', () => {
  it('overrides telefono and correo_electronico with the fixed test values', () => {
    const result = applyTdmTestModeOverrides(basePayload())
    expect(result.telefono).toBe(TDM_TEST_PHONE)
    expect(result.correo_electronico).toBe(TDM_TEST_EMAIL)
  })

  it('leaves every other field untouched', () => {
    const payload = basePayload()
    const result = applyTdmTestModeOverrides(payload)
    expect(result).toEqual({ ...payload, telefono: TDM_TEST_PHONE, correo_electronico: TDM_TEST_EMAIL })
  })

  it('overrides even when telefono/correo_electronico were already null', () => {
    const result = applyTdmTestModeOverrides(basePayload({ telefono: null, correo_electronico: null }))
    expect(result.telefono).toBe(TDM_TEST_PHONE)
    expect(result.correo_electronico).toBe(TDM_TEST_EMAIL)
  })
})
