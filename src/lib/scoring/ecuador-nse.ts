import ecuadorNseJson from '../../../data/scoring/ecuador-nse.json'

export interface EcuadorNseAnswers {
  healthInsurancePsh?: string | null
  monthlyIncome?: string | null
  dwellingFinishes?: string | null
  floorMaterial?: string | null
  vehicleCount?: string | null
  occupationPsh?: string | null
  educationPsh?: string | null
  internetAccess?: string | null
}

export type EcuadorNseLevel = 'A' | 'B' | 'C' | 'D' | 'E'

export interface EcuadorNseResult {
  points: number
  level: EcuadorNseLevel
  contributions: Record<string, number>
}

interface EcuadorNseData {
  version: string
  variables: {
    healthInsurancePsh: Record<string, number>
    monthlyIncome: Record<string, number>
    dwellingFinishes: Record<string, number>
    floorMaterial: Record<string, number>
    vehicleCount: Record<string, number>
    occupation: Record<string, number>
    educationPsh: Record<string, number>
    internetAccess: Record<string, number>
  }
  levelCutoffs: { maxPoints: number; level: EcuadorNseLevel }[]
}

const data = ecuadorNseJson as EcuadorNseData

function points(table: Record<string, number>, answer: string | null | undefined): number {
  if (!answer) return 0
  return table[answer] ?? 0
}

function levelFor(total: number): EcuadorNseLevel {
  const cutoffs = [...data.levelCutoffs].sort((a, b) => a.maxPoints - b.maxPoints)
  for (const c of cutoffs) {
    if (total <= c.maxPoints) return c.level
  }
  return cutoffs[cutoffs.length - 1]?.level ?? 'E'
}

/**
 * Official Ecuador NSE formula (docs/ecuador/flujo_kantar_ecuador.md §5, transcribed in
 * data/scoring/ecuador-nse.json). Sum of 8 variables; occupation is the single "principal
 * sostén del hogar" (PSH) value. Missing/unknown answers contribute 0. Level cutoffs are
 * the official 5-level scale (A 91+, B 76–90, C 51–75, D 31–50, E 0–30).
 */
export function computeEcuadorNse(answers: EcuadorNseAnswers): EcuadorNseResult {
  const contributions: Record<string, number> = {
    healthInsurancePsh: points(data.variables.healthInsurancePsh, answers.healthInsurancePsh),
    monthlyIncome: points(data.variables.monthlyIncome, answers.monthlyIncome),
    dwellingFinishes: points(data.variables.dwellingFinishes, answers.dwellingFinishes),
    floorMaterial: points(data.variables.floorMaterial, answers.floorMaterial),
    vehicleCount: points(data.variables.vehicleCount, answers.vehicleCount),
    occupation: points(data.variables.occupation, answers.occupationPsh),
    educationPsh: points(data.variables.educationPsh, answers.educationPsh),
    internetAccess: points(data.variables.internetAccess, answers.internetAccess),
  }

  const total = Object.values(contributions).reduce((sum, v) => sum + v, 0)

  console.info(
    JSON.stringify({
      event: 'nse_score',
      country: 'Ecuador',
      points: total,
      level: levelFor(total),
      contributions,
    }),
  )

  return { points: total, level: levelFor(total), contributions }
}
