import type { ScoringFields } from '@/types/lead'

// Education PSH scoring weights (provided by Treinta — placeholder values)
const EDUCATION_SCORES: Record<string, number> = {
  'Sin instrucción formal': 0,
  'Primaria Incompleta': 1,
  'Primaria Completa': 2,
  'Sec. Incompleta': 3,
  'Secundaria Completa': 4,
  'Bach. Incompleto': 5,
  'Bach. Completo': 6,
  'Univ. Incompleta': 7,
  'Universidad Completa': 8,
  Posgrado: 9,
}

const CAR_SCORES: Record<string, number> = {
  '0': 0,
  '1': 3,
  '2 o más': 5,
}

export function calculateScore(fields: ScoringFields): number {
  let score = 0

  // Education (0-9 → 0-36 points)
  score += (EDUCATION_SCORES[fields.educationPsh ?? ''] ?? 0) * 4

  // Cars (0-5 points)
  score += CAR_SCORES[fields.cars ?? '0'] ?? 0

  // Domestic help (0 or 10 points)
  score += fields.domesticHelp ? 10 : 0

  // Household size inverse (smaller = higher SES, max 15 pts)
  const size = fields.householdSize ?? 4
  score += Math.max(0, 15 - size * 2)

  // Bedrooms (1 point each, max 10)
  score += Math.min(10, (fields.bedrooms ?? 0) * 2)

  // Clamp 0-100
  return Math.max(0, Math.min(100, score))
}

export function getQuotaSegment(score: number): string {
  if (score >= 70) return 'A/B'
  if (score >= 50) return 'C+'
  if (score >= 30) return 'C'
  if (score >= 15) return 'D+'
  return 'D/E'
}
