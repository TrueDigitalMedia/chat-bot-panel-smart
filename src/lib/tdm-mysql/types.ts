/**
 * Partial row shape for TDM/Kantar's `tb_leads_agente_ia` (db_kantar_leads, MySQL).
 * Only the columns this feature writes — see specs/010-tdm-lead-sync/data-model.md §2
 * for the full column-by-column source map, including the columns deliberately left
 * out of this type because we never write them (TDM-internal-process-owned, or no
 * reliable source on our side).
 */
export interface TbLeadsAgenteIaRow {
  tenant_id: string | null
  lead_version: string | null
  source: string | null
  status: string | null
  lead_status: string | null
  f1_lead_status?: string | null
  created_at: Date | null
  updated_at: Date | null
  phone: string | null
  lead_score: number | null
  score_category: string | null
  nombre_completo: string | null
  correo_electronico: string | null
  genero: string | null
  estado_residencia: string | null
  municipio_residencia: string | null
  kantar_region: string | null
  automoviles: string | null
  cuartos_dormir: number | null
  frecuencia_compras_hogar: string | null
  metodo_contacto_preferido: string | null
  horario_contacto_preferido: string | null
  nivel_educacion_jefe_hogar: string | null
  categorias_compras_hogar: string | null
  country: string | null
  pais_residencia: string | null
  servicio_domestico: boolean | null
  personas_hogar: number | null
  num_integrantes_hogar: number | null
  edad_ama_casa: number | null
  embarazo: boolean | null
  parroquia_residencia: string | null
  provincia_residencia: string | null
  canton_residencia: string | null
  parroquia: string | null
  provincia: string | null
  canton: string | null
  thread_summary: string | null
  json_raw: string | null
  // Ficha Hogar update-only columns
  internet_hogar?: boolean | null
  acceso_internet?: boolean | null
  parentesco_jefe_familia?: string | null
  fecha_nacimiento_ama_casa?: string | null
  discapacidad_total?: boolean | null
  plan_datos_ilimitado?: boolean | null
  num_mascotas?: number | null
  _ficha_hogar_completed_at?: Date | null
  /** `ficha_hogar_profiles.created_at` — when the Ficha Hogar questionnaire first opened for this lead. */
  _ficha_hogar_launched_at?: Date | null
}
