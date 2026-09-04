import ecuadorNseJson from '../../../data/scoring/ecuador-nse.json'

export interface EcuadorNseAnswers {
  healthInsurancePsh?: string | null
  monthlyIncome?: string | null
  dwellingFinishes?: string | null
  floorMaterial?: string | null
  vehicleCount?: string | null
  occupationHead?: string | null
  occupationAma?: string | null
  educationPsh?: string | null
  internetAccess?: string | null
}

export type EcuadorNseLevel = 'AB' | 'C' | 'D/E'

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
  return cutoffs[cutoffs.length - 1]?.level ?? 'D/E'
}

/**
 * Official Ecuador NSE formula (docs/ecuador/Muestra Regiones NSE Ecuador.xlsx, transcribed
 * in data/scoring/ecuador-nse.json). Sum of 8 variables; occupation is the higher of the
 * head-of-household's and the "ama de casa"'s point value (research R2). Missing/unknown
 * answers contribute 0.
 */
export function computeEcuadorNse(answers: EcuadorNseAnswers): EcuadorNseResult {
  const occupationHeadPts = points(data.variables.occupation, answers.occupationHead)
  const occupationAmaPts = points(data.variables.occupation, answers.occupationAma)

  const contributions: Record<string, number> = {
    healthInsurancePsh: points(data.variables.healthInsurancePsh, answers.healthInsurancePsh),
    monthlyIncome: points(data.variables.monthlyIncome, answers.monthlyIncome),
    dwellingFinishes: points(data.variables.dwellingFinishes, answers.dwellingFinishes),
    floorMaterial: points(data.variables.floorMaterial, answers.floorMaterial),
    vehicleCount: points(data.variables.vehicleCount, answers.vehicleCount),
    occupation: Math.max(occupationHeadPts, occupationAmaPts),
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
