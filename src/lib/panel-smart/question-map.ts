import { SURVEY_QUESTIONS, SHOPPING_CATEGORIES } from '@/lib/conversation/survey-questions'
import { FICHA_HOGAR_QUESTIONS } from '@/lib/conversation/ficha-hogar-questions'
import type { SurveyFieldName, FichaHogarFieldName } from '@/types/lead'
import type { PanelSmartResponseItem } from './types'

export type SyncableFieldName = SurveyFieldName | FichaHogarFieldName

const QUESTION_TEXT_BY_FIELD = new Map<string, string>([
  ...SURVEY_QUESTIONS.map((q) => [q.fieldName, q.text] as const),
  ...FICHA_HOGAR_QUESTIONS.map((q) => [q.fieldName, q.text] as const),
])

/**
 * codigo_pregunta = our internal field name, for now. The task's sample payload uses
 * codes like "income"/"car" that don't map 1:1 onto this codebase's field names (e.g.
 * the car-ownership field is `cars`, there's no `income` field at all) — this is a
 * placeholder until Kantar hands over an official per-question code list. Centralized
 * here so remapping later is a single-file change.
 */
export function codigoPreguntaForField(fieldName: SyncableFieldName): string {
  return fieldName
}

export function preguntaForField(fieldName: SyncableFieldName): string {
  return QUESTION_TEXT_BY_FIELD.get(fieldName) ?? fieldName
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
