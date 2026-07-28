import type { RegistrationCodeRequestPayload } from './types'

/**
 * TDM has no sandbox/test environment — while TDM_TEST_MODE_ENABLED is on, every outbound
 * request to /api/ai-lead overrides telefono/correo_electronico with these fixed values so
 * TDM can identify (and discard) test records among real ones. Everything else in the
 * payload (name, geo, lead_id, etc.) stays real.
 */
export const TDM_TEST_PHONE = '+50255551234'
export const TDM_TEST_EMAIL = 'test@example.com'

export function applyTdmTestModeOverrides(
  payload: RegistrationCodeRequestPayload,
): RegistrationCodeRequestPayload {
  return { ...payload, telefono: TDM_TEST_PHONE, correo_electronico: TDM_TEST_EMAIL }
}
