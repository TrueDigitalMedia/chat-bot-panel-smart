import { getCountryConfig } from '@/lib/countries/registry'
import type { FichaHogarQuestion } from './ficha-hogar-questions'

/**
 * The country-resolved Ficha Hogar (Fase 4) question list — the analogue of
 * resolveSurveyQuestions for Phase 1. CAM/RD and México use the shared 7-question list;
 * Ecuador uses its own 6-question list (docs/ecuador/flujo_kantar_ecuador.md §4). Every
 * question is re-indexed 1..N by its position here.
 */
export function resolveFichaHogarQuestions(country: string | null | undefined): FichaHogarQuestion[] {
  const cfg = getCountryConfig(country)
  return cfg.fichaHogarQuestions.map((q, i) => ({ ...q, index: i + 1 }))
}

/** Single source of truth for the Ficha Hogar total question count for a given country. */
export function fichaHogarQuestionCount(country: string | null | undefined): number {
  return getCountryConfig(country).fichaHogarQuestions.length
}
