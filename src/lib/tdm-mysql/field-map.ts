import { env } from '@/lib/env'
import { SHOPPING_CATEGORIES } from '@/lib/conversation/survey-questions'
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

export function mapShoppingCategories(ids: number[] | null): string | null {
  if (!ids || ids.length === 0) return null
  const labels = ids
    .map((id) => SHOPPING_CATEGORIES.find((c) => c.id === id)?.label)
    .filter((label): label is string => Boolean(label))
  return labels.length > 0 ? labels.join(', ') : null
}

/**
 * Builds the full row to write to `tb_leads_agente_ia` for the lead's CURRENT state,
 * whatever that is — qualified or not, any phase (spec 010 amendment: every status
 * transition syncs, not just the "happy path"). Called once per transition from
 * `transitionLead` (`src/lib/state-machine/index.ts`), so `lead`/`profile` are always
 * freshly loaded (never a stale pre-transition snapshot — see research.md R11).
 *
 * `fichaHogar` is `null` until the lead reaches Fase 4 — household columns (§2c) are
 * simply omitted from the row until then, and once present, ride along on every later
 * sync (registration retries, etc.) same as any other column.
 *
 * `isFirstSync` controls whether `f1_lead_status` is included: it's write-once, frozen
 * at whatever status the lead had at its FIRST sync ever, and must never be touched by
 * later updates — so subsequent calls simply omit the key from the row entirely (an
 * UPDATE only SETs the columns present in the object, so omitting it preserves the
 * value already stored in MySQL).
 */
export function buildLeadRow(
  lead: Lead,
  profile: SurveyProfile,
  fichaHogar: FichaHogarProfile | null,
  isFirstSync: boolean,
): TbLeadsAgenteIaRow {
  const row: TbLeadsAgenteIaRow = {
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
    // Populated by phase-4.ts before it transitions the lead — null until then.
    thread_summary: lead.conversationSummary,
    // hasBabyUnder3/conflictOfInterest have no dedicated tb_leads_agente_ia column yet
    // (data-model.md §2f) — they still ride along here so the raw answer isn't lost.
    json_raw: JSON.stringify(fichaHogar ? { ...profile, ...fichaHogar } : { ...profile }),
  }

  if (isFirstSync) {
    row.f1_lead_status = lead.leadStatus
  }

  if (fichaHogar) {
    row.internet_hogar = fichaHogar.hasInternet
    row.acceso_internet = fichaHogar.hasInternet
    row.parentesco_jefe_familia = fichaHogar.relationshipToHoh
    row.fecha_nacimiento_ama_casa = fichaHogar.dateOfBirth
    // Interpretive — not a verified semantic match, pending TDM confirmation (spec Assumptions).
    row.discapacidad_total = fichaHogar.hasHealthCondition
    row.plan_datos_ilimitado = fichaHogar.unlimitedDataPlan
    row.num_mascotas = fichaHogar.petCount
    row._ficha_hogar_completed_at = fichaHogar.completedAt
    row._ficha_hogar_launched_at = fichaHogar.createdAt
  }

  return row
}
