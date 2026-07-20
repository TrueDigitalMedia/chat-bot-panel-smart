import { env } from '@/lib/env'
import type { FichaHogarProfile, Lead, LeadStatus, SurveyProfile } from '@/types/lead'
import type { TbLeadsAgenteIaRow } from './types'

/**
 * Coarse status bucket for TDM's varchar(20) `status` column. Best-effort mapping
 * pending TDM confirmation — `lead_status` always carries the untruncated detail
 * alongside it, so nothing is lost if this bucket guess is wrong. See
 * specs/010-tdm-lead-sync/data-model.md §3.
 */
const COARSE_STATUS_MAP: Record<LeadStatus, string> = {
  incomplete: 'rejected',
  not_qualified: 'rejected',
  quota_exhausted: 'rejected',
  ficha_hogar_descartado: 'rejected',
  link_sent: 'active',
  waiting_for_code: 'active',
  code_delivered_registered: 'qualified',
  ficha_hogar_completada: 'qualified',
  code_delivered_not_registered: 'dropped',
  code_delivered_no_response: 'dropped',
  abandono: 'dropped',
}

export function mapCoarseStatus(leadStatus: LeadStatus): string {
  return COARSE_STATUS_MAP[leadStatus]
}

/**
 * Q14's exact category list (src/lib/conversation/survey-questions.ts, index 14),
 * ids 1-8 in display order.
 */
const SHOPPING_CATEGORY_LABELS: readonly string[] = [
  'Canasta básica',
  'Lácteos',
  'Bebidas',
  'Snacks/Botanas',
  'Cuidado personal',
  'Prod. de limpieza',
  'Cuidado del bebé',
  'Mascotas',
]

export function mapShoppingCategories(ids: number[] | null): string | null {
  if (!ids || ids.length === 0) return null
  const labels = ids
    .map((id) => SHOPPING_CATEGORY_LABELS[id - 1])
    .filter((label): label is string => Boolean(label))
  return labels.length > 0 ? labels.join(', ') : null
}

type BaseColumns = Omit<
  TbLeadsAgenteIaRow,
  | 'f1_lead_status'
  | 'internet_hogar'
  | 'acceso_internet'
  | 'parentesco_jefe_familia'
  | 'fecha_nacimiento_ama_casa'
  | 'discapacidad_total'
  | 'plan_datos_ilimitado'
  | 'num_mascotas'
  | '_ficha_hogar_completed_at'
>

/**
 * Columns present on every write (Phase 1 insert and both later updates) — spec 010
 * data-model.md §2a/§2b. `thread_summary`/`json_raw` are set here as defaults and
 * overridden by each caller with the right content for that moment.
 */
function buildBaseRow(lead: Lead, profile: SurveyProfile): BaseColumns {
  return {
    tenant_id: env.CLIENT_MYSQL_TENANT_ID ?? null,
    lead_version: env.CLIENT_MYSQL_LEAD_VERSION ?? null,
    source: lead.channel,
    status: mapCoarseStatus(lead.leadStatus),
    lead_status: lead.leadStatus,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
    phone: lead.phoneNumber,
    lead_score: lead.score,
    score_category: lead.quotaSegment,
    nombre_completo: profile.fullName,
    correo_electronico: profile.email,
    genero: profile.gender,
    estado_residencia: profile.stateProvince,
    municipio_residencia: profile.municipality,
    kantar_region: profile.nseRegion,
    automoviles: profile.cars,
    cuartos_dormir: profile.bedrooms,
    frecuencia_compras_hogar: profile.shoppingFrequency,
    metodo_contacto_preferido: profile.contactChannel,
    horario_contacto_preferido: profile.contactSchedule,
    nivel_educacion_jefe_hogar: profile.educationPsh,
    categorias_compras_hogar: mapShoppingCategories(profile.shoppingCategories),
    country: profile.country,
    pais_residencia: profile.country,
    servicio_domestico: profile.domesticHelp,
    personas_hogar: profile.householdSize,
    num_integrantes_hogar: profile.householdSize,
    // Interpretive — not a verified semantic match, pending TDM confirmation (spec Assumptions).
    edad_ama_casa: profile.age,
    embarazo: profile.isPregnant,
    // Generic fallback: admin-division naming varies by country, not refined here (spec Out of Scope).
    parroquia_residencia: profile.stateProvince,
    provincia_residencia: profile.municipality,
    canton_residencia: profile.neighborhood,
    parroquia: profile.stateProvince,
    provincia: profile.municipality,
    canton: profile.neighborhood,
    thread_summary: null,
    json_raw: null,
  }
}

/** Phase 1 complete + quota available — INSERT-only row. */
export function buildPhase1InsertRow(lead: Lead, profile: SurveyProfile): TbLeadsAgenteIaRow {
  return {
    ...buildBaseRow(lead, profile),
    // Write-once: frozen at the moment quota was confirmed available, never touched again.
    f1_lead_status: lead.leadStatus,
    thread_summary: null,
    json_raw: JSON.stringify(profile),
  }
}

/** Ficha Hogar completed — enriches the existing row with household data. */
export function buildFichaHogarUpdateRow(
  lead: Lead,
  profile: SurveyProfile,
  fichaHogar: FichaHogarProfile,
  summary: string | null,
): TbLeadsAgenteIaRow {
  return {
    ...buildBaseRow(lead, profile),
    thread_summary: summary,
    json_raw: JSON.stringify({ ...profile, ...fichaHogar }),
    internet_hogar: fichaHogar.hasInternet,
    acceso_internet: fichaHogar.hasInternet,
    parentesco_jefe_familia: fichaHogar.relationshipToHoh,
    fecha_nacimiento_ama_casa: fichaHogar.dateOfBirth,
    // Interpretive — not a verified semantic match, pending TDM confirmation (spec Assumptions).
    discapacidad_total: fichaHogar.hasHealthCondition,
    plan_datos_ilimitado: fichaHogar.unlimitedDataPlan,
    num_mascotas: fichaHogar.petCount,
    _ficha_hogar_completed_at: fichaHogar.completedAt,
  }
}

/** Ficha Hogar Q1 discard — same base shape, discard status override, no household columns. */
export function buildDiscardUpdateRow(lead: Lead, profile: SurveyProfile): TbLeadsAgenteIaRow {
  return {
    ...buildBaseRow(lead, profile),
    status: mapCoarseStatus('ficha_hogar_descartado'),
    lead_status: 'ficha_hogar_descartado' satisfies LeadStatus,
    thread_summary: null,
    json_raw: JSON.stringify(profile),
  }
}
