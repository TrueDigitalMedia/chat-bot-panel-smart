import type { ScoringFields } from '@/types/lead'

// Official Kantar Worldpanel SCL-CAM formula (docs/SCL-CAM.pdf, transcribed in docs/WIKI.md §6).
// NiPSH — nivel educativo del Principal Sostén del Hogar (12 official levels).
// Exported so callers (e.g. survey-questions.ts button labels) can be tested against
// the same source of truth instead of duplicating the list.
export const NIPSH_SCORES: Record<string, number> = {
  'No alfabetizado': 0,
  'Alfabetizado pero no en escuela normal': 0,
  'Primaria Incompleta': 0,
  'Primaria Completa': 0,
  'Secundaria Incompleta': 250,
  'Secundaria Completa': 250,
  'Bachillerato Incompleto': 250,
  'Bachillerato Completo': 400,
  'Universidad Incompleta': 900,
  'Universidad Completa': 1000,
  'Pos Grado Incompleto': 1000,
  'Pos Grado Completo': 1000,
}

// AUTO — número de automóviles particulares.
const AUTO_SCORES: Record<string, number> = {
  '0': 0,
  '1': 650,
  '2 o más': 1000,
}

/**
 * HACI — hacinamiento: (10 × personas en el hogar) / dormitorios exclusivos.
 * Sin dormitorios exclusivos → HACI = 99 (muy hacinado).
 */
function calculateHaciPoints(householdSize: number | null, bedrooms: number | null): number {
  const size = householdSize ?? 0
  const haci = !bedrooms || bedrooms <= 0 ? 99 : (10 * size) / bedrooms

  if (haci >= 25) return 0
  if (haci > 15) return 250
  if (haci >= 10) return 500
  return 1000
}

export function calculateScore(fields: ScoringFields): number {
  const nipsh = NIPSH_SCORES[fields.educationPsh ?? ''] ?? 0
  const haci = calculateHaciPoints(fields.householdSize, fields.bedrooms)
  const auto = AUTO_SCORES[fields.cars ?? '0'] ?? 0
  const sd = fields.domesticHelp ? 1000 : 0

  return Math.round((45 * nipsh + 18 * haci + 28 * auto + 9 * sd) / 100)
}

export function getQuotaSegment(score: number): string {
  if (score >= 540) return 'Nivel 1'
  if (score > 325) return 'Nivel 2'
  if (score > 180) return 'Nivel 3'
  return 'Nivel 4'
}
