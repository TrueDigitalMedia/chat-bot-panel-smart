import { SHOPPING_CATEGORIES } from '@/lib/conversation/survey-questions'
import { resolveSurveyQuestions } from '@/lib/conversation/survey-plan'
import { FICHA_HOGAR_QUESTIONS, MEXICO_FICHA_HOGAR_QUESTIONS } from '@/lib/conversation/ficha-hogar-questions'
import type { SurveyFieldName, FichaHogarFieldName, NonColumnScoringFieldName } from '@/types/lead'
import type { PanelSmartResponseItem } from './types'

export type SyncableFieldName = SurveyFieldName | FichaHogarFieldName | NonColumnScoringFieldName

// Explicit short labels for the Ecuador/México NSE-scoring fields that have no
// survey_profiles column (see @/types/lead's NON_COLUMN_SCORING_FIELDS) — sourced from
// docs/ecuador/Cuestionario Ecuador.docx and docs/mexico/Cuestionario Mexico.docx, kept
// short rather than pulled from the countries' `text` (which, for educationHoh, carries a
// multi-line in-chat intro banner not fit for a sync label). Field-name-keyed like the
// rest of this file, so vehicleCount (shared by both countries with different in-chat
// wording) gets one consistent TDM label instead of whichever country's text won a spread
// collision.
const NON_COLUMN_SCORING_FIELD_LABELS: Record<NonColumnScoringFieldName, string> = {
  // Ecuador
  healthInsurancePsh: 'Seguro de Salud (PSH)',
  monthlyIncome: 'Ingresos Mensuales del Hogar',
  dwellingFinishes: 'Acabados de la Vivienda',
  floorMaterial: 'Material de Piso',
  vehicleCount: 'Vehículos del Hogar',
  occupationPsh: 'Ocupación del Principal Sostén del Hogar (PSH)',
  internetAccess: 'Acceso a Internet',
  // México
  educationHoh: 'Educación del Jefe de Hogar',
  fullBathrooms: 'Baños Completos en la Vivienda',
  homeInternet: 'Internet en el Hogar',
  workers14Plus: 'Personas de 14+ Años que Trabajaron',
}

// CAM question text only (legacy TDM/MySQL sync labels) — resolveSurveyQuestions(null)
// falls back to the CAM config. Non-CAM (Ecuador/México) NSE-variable field names aren't
// in this map; their labels come from NON_COLUMN_SCORING_FIELD_LABELS above instead.
//
// This map is keyed by field name only (not per-country), so a field that means the same
// thing everywhere (dateOfBirth, petCount, ...) can share one label. But conflictOfInterest
// has different wording in MEXICO_FICHA_HOGAR_QUESTIONS than in the shared FICHA_HOGAR_QUESTIONS
// — spreading the whole México list here would silently overwrite CAM/Ecuador's label too, so
// only internetServiceType (a field that doesn't exist in the shared list at all) is added from
// it; relationshipToHoh/conflictOfInterest/etc keep the shared list's label for every country.
// codigoPostal moved from Phase 1 (survey_profiles.scoring_answers_json) to Ficha Hogar
// (ficha_hogar_profiles.codigoPostal, spec 015 T031) — kept out of the generic label/code
// spread below so its pre-existing Kantar sync contract (short label, snake_case code)
// doesn't change: MEXICO_FICHA_HOGAR_QUESTIONS' own text is the long in-chat prompt, not a
// sync label, and 'codigoPostal' the field name isn't the code Kantar was already sent.
const MEXICO_ONLY_FICHA_HOGAR_QUESTIONS = MEXICO_FICHA_HOGAR_QUESTIONS.filter(
  (q) => !FICHA_HOGAR_QUESTIONS.some((shared) => shared.fieldName === q.fieldName) && q.fieldName !== 'codigoPostal',
)
const QUESTION_TEXT_BY_FIELD = new Map<string, string>([
  ...resolveSurveyQuestions(null).map((q) => [q.fieldName, q.text] as const),
  ...FICHA_HOGAR_QUESTIONS.map((q) => [q.fieldName, q.text] as const),
  ...MEXICO_ONLY_FICHA_HOGAR_QUESTIONS.map((q) => [q.fieldName, q.text] as const),
  ['codigoPostal', 'Código Postal'],
])

const CODIGO_PREGUNTA_OVERRIDES: Partial<Record<SyncableFieldName, string>> = {
  codigoPostal: 'codigo_postal',
}

/**
 * codigo_pregunta = our internal field name, for now. The task's sample payload uses
 * codes like "income"/"car" that don't map 1:1 onto this codebase's field names (e.g.
 * the car-ownership field is `cars`, there's no `income` field at all) — this is a
 * placeholder until Kantar hands over an official per-question code list. Centralized
 * here so remapping later is a single-file change. `codigo_postal` (México) is the one
 * field already sent under an explicit snake_case code (spec 015 T031) — preserved via
 * CODIGO_PREGUNTA_OVERRIDES rather than the camelCase field name.
 */
export function codigoPreguntaForField(fieldName: SyncableFieldName): string {
  return CODIGO_PREGUNTA_OVERRIDES[fieldName] ?? fieldName
}

export function preguntaForField(fieldName: SyncableFieldName): string {
  return (
    NON_COLUMN_SCORING_FIELD_LABELS[fieldName as NonColumnScoringFieldName] ??
    QUESTION_TEXT_BY_FIELD.get(fieldName) ??
    fieldName
  )
}

function mapShoppingCategoryLabels(ids: number[]): string {
  const labels = ids
    .map((id) => SHOPPING_CATEGORIES.find((c) => c.id === id)?.label)
    .filter((label): label is string => Boolean(label))
  return labels.length > 0 ? labels.join(', ') : ids.join(', ')
}

/** Same boolean/array formatting convention already used ad hoc in conversation/correction.ts. */
export function formatRespuesta(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number')) return mapShoppingCategoryLabels(value as number[])
    return value.join(', ')
  }
  return String(value)
}

export function buildResponseItem(fieldName: SyncableFieldName, value: unknown): PanelSmartResponseItem {
  return {
    codigo_pregunta: codigoPreguntaForField(fieldName),
    pregunta: preguntaForField(fieldName),
    respuesta: formatRespuesta(value),
  }
}
