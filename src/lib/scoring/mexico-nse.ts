import mexicoNseJson from '../../../data/scoring/mexico-nse.json'

export interface MexicoNseAnswers {
  educationHoh?: string | null
  fullBathrooms?: string | null
  vehicleCount?: string | null
  homeInternet?: string | null
  workers14Plus?: string | null
  /** Stored as an integer (typed `survey_profiles.bedrooms` column) — bucketed below. */
  bedrooms?: number | string | null
}

export type MexicoNseLevel = 'AB' | 'C+' | 'C' | 'D+' | 'D/E'

export interface MexicoNseResult {
  points: number
  level: MexicoNseLevel
  contributions: Record<string, number>
}

interface MexicoNseData {
  version: string
  variables: {
    educationHoh: Record<string, number>
    fullBathrooms: Record<string, number>
    vehicleCount: Record<string, number>
    homeInternet: Record<string, number>
    workers14Plus: Record<string, number>
    bedrooms: Record<string, number>
  }
  levelCutoffs: { maxPoints: number; level: MexicoNseLevel }[]
}

const data = mexicoNseJson as MexicoNseData

function points(table: Record<string, number>, answer: string | null | undefined): number {
  if (!answer) return 0
  return table[answer] ?? 0
}

/** `bedrooms` is a typed integer column; its point table's top key is "4 o más". */
function bedroomsBucket(value: number | string | null | undefined): string | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return null
  return n >= 4 ? '4 o más' : String(n)
}

function levelFor(total: number): MexicoNseLevel {
  const cutoffs = [...data.levelCutoffs].sort((a, b) => a.maxPoints - b.maxPoints)
  for (const c of cutoffs) {
    if (total <= c.maxPoints) return c.level
  }
  return cutoffs[cutoffs.length - 1]?.level ?? 'D/E'
}

/**
 * Mexico AMAI-style NSE formula (docs/mexico/Muestra Regiones NSE Mexico.xlsx, transcribed
 * in data/scoring/mexico-nse.json). Sum of 6 variables; missing/unknown answers contribute
 * 0; totals below the lowest cutoff floor to "D/E" (research R5). The Código Postal answer
 * is captured for the geo fallback only and is NOT a scoring variable.
 */
export function computeMexicoNse(answers: MexicoNseAnswers): MexicoNseResult {
  const contributions: Record<string, number> = {
    educationHoh: points(data.variables.educationHoh, answers.educationHoh),
    fullBathrooms: points(data.variables.fullBathrooms, answers.fullBathrooms),
    vehicleCount: points(data.variables.vehicleCount, answers.vehicleCount),
    homeInternet: points(data.variables.homeInternet, answers.homeInternet),
    workers14Plus: points(data.variables.workers14Plus, answers.workers14Plus),
    bedrooms: points(data.variables.bedrooms, bedroomsBucket(answers.bedrooms)),
  }

  const total = Object.values(contributions).reduce((sum, v) => sum + v, 0)
  const level = levelFor(total)

  console.info(
    JSON.stringify({
      event: 'nse_score',
      country: 'México',
      points: total,
      level,
      contributions,
    }),
  )

  return { points: total, level, contributions }
}
