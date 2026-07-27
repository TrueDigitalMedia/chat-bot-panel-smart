/**
 * Outbound JSON we POST to TDM to request a registration code — field names/shape
 * agreed directly with the client (not TDM's own schema, unlike tdm-mysql/types.ts).
 * See specs/001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md §2b.
 */
export interface RegistrationCodeRequestPayload {
  lead_id: string
  canal: string
  pais_codigo: string | null
  pais_residencia: string | null
  nombre_completo: string | null
  telefono: string | null
  correo_electronico: string | null
  region: string | null
  departamento_provincia: string | null
  municipio_canton: string | null
  barrio_parroquia: string | null
  metodo_contacto_preferido: string | null
  horario_contacto_preferido: string | null
  /** Always null for now — DOB isn't collected until Ficha Hogar, after registration. */
  fecha_nacimiento: null
}
