import { countryCodeFor } from './country-codes'
import type { RegistrationCodeRequestPayload } from './types'
import type { Lead, SurveyProfile } from '@/types/lead'

/** Pure field mapping — no I/O, see build-request.test.ts. */
export function buildRegistrationCodeRequest(
  lead: Lead,
  profile: SurveyProfile,
): RegistrationCodeRequestPayload {
  return {
    lead_id: lead.id,
    canal: lead.channel,
    pais_codigo: countryCodeFor(profile.country),
    pais_residencia: profile.country,
    nombre_completo: profile.fullName,
    telefono: lead.phoneNumber,
    correo_electronico: profile.email,
    region: profile.nseRegion,
    departamento_provincia: profile.stateProvince,
    municipio_canton: profile.municipality,
    barrio_parroquia: profile.neighborhood,
    metodo_contacto_preferido: profile.contactChannel,
    horario_contacto_preferido: profile.contactSchedule,
    fecha_nacimiento: null,
  }
}
