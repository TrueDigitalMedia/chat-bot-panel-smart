import guatemalaData from '../../../data/geo/guatemala.json'
import { normalizeGeo, bestRanked, toGeoResult } from './fuzzy-match'
import type { GeoValidationResult } from './fuzzy-match'

export type GeoField = 'stateProvince' | 'municipality' | 'neighborhood'
export type { GeoValidationResult }

interface Department {
  name: string
  municipalities: string[]
}

const DEPARTMENTS = guatemalaData.departments as Department[]

/** Guatemala City zones used as distrito/barrio equivalents. */
const CAPITAL_ZONES = Array.from({ length: 25 }, (_, i) => `Zona ${i + 1}`)

function findDepartment(name: string): Department | null {
  const match = bestRanked(name, DEPARTMENTS.map((d) => d.name))
  return match ? DEPARTMENTS.find((d) => d.name === match.name) ?? null : null
}

export function validateGuatemalaDepartment(input: string): GeoValidationResult {
  return toGeoResult(
    bestRanked(input, DEPARTMENTS.map((d) => d.name)),
    'No reconocí ese departamento. Ejemplos: Guatemala, Sacatepéquez, Quetzaltenango, Alta Verapaz. ¿Puedes escribirlo de nuevo?',
  )
}

export function validateGuatemalaMunicipality(
  input: string,
  departmentName: string,
): GeoValidationResult {
  const dept = findDepartment(departmentName)
  if (!dept) {
    return {
      ok: false,
      message: 'Primero necesito un departamento válido de Guatemala. ¿En qué departamento vives?',
    }
  }
  const examples = dept.municipalities.slice(0, 4).join(', ')
  return toGeoResult(
    bestRanked(input, dept.municipalities),
    `No reconocí ese municipio en ${dept.name}. Ejemplos: ${examples}. ¿Puedes intentar de nuevo?`,
  )
}

/**
 * Distrito/barrio/zona for Guatemala.
 * - Municipio Guatemala (capital): must match Zona 1–25
 * - Other municipios: accept barrio/colonia/aldea/zona with min length
 */
export function validateGuatemalaNeighborhood(
  input: string,
  municipalityName: string,
): GeoValidationResult {
  const cleaned = input.trim()
  if (cleaned.length < 2) {
    return {
      ok: false,
      message: 'Indica tu zona, barrio, colonia o aldea (por ejemplo: Zona 10, Colonia El Maestro).',
    }
  }

  const isCapital = normalizeGeo(municipalityName) === 'guatemala'
  if (isCapital) {
    const zonaMatch = cleaned.match(/zona\s*(\d{1,2})/i)
    if (zonaMatch) {
      const n = Number(zonaMatch[1])
      if (n >= 1 && n <= 25) {
        return { ok: true, canonical: `Zona ${n}`, needsConfirmation: false, score: 1 }
      }
      return {
        ok: false,
        message:
          'En la Ciudad de Guatemala indica la zona (Zona 1 a Zona 25). Ejemplo: Zona 10.',
      }
    }
    const match = bestRanked(cleaned, CAPITAL_ZONES)
    if (!match) {
      return {
        ok: false,
        message:
          'En la Ciudad de Guatemala indica la zona (Zona 1 a Zona 25). Ejemplo: Zona 10.',
      }
    }
    return {
      ok: true,
      canonical: match.name,
      needsConfirmation: !match.exact,
      score: match.score,
    }
  }

  if (bestRanked(cleaned, DEPARTMENTS.map((d) => d.name))?.score && bestRanked(cleaned, DEPARTMENTS.map((d) => d.name))!.score >= 0.9) {
    return {
      ok: false,
      message: 'Eso parece un departamento. Indica tu barrio, colonia, aldea o zona dentro del municipio.',
    }
  }

  return { ok: true, canonical: cleaned, needsConfirmation: false, score: 1 }
}

export function validateGuatemalaGeoField(
  field: GeoField,
  value: string,
  ctx: { stateProvince?: string | null; municipality?: string | null },
): GeoValidationResult {
  if (field === 'stateProvince') return validateGuatemalaDepartment(value)
  if (field === 'municipality') {
    return validateGuatemalaMunicipality(value, ctx.stateProvince ?? '')
  }
  return validateGuatemalaNeighborhood(value, ctx.municipality ?? '')
}

export function guatemalaQuestionText(field: GeoField): string {
  if (field === 'stateProvince') return '¿En qué departamento de Guatemala vives?'
  if (field === 'municipality') return '¿En qué municipio vives?'
  return '¿En qué zona, barrio, colonia o aldea vives?'
}

export function geoConfirmPrompt(canonical: string): string {
  return `¿Quisiste decir ${canonical}? Si no es correcto, elige «No, corregir» y escríbelo de nuevo.`
}
