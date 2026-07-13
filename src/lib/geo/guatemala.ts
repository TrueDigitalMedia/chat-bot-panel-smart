import guatemalaData from '../../../data/geo/guatemala.json'

export type GeoField = 'stateProvince' | 'municipality' | 'neighborhood'

export interface GeoValidationResult {
  ok: boolean
  /** Canonical official name when matched */
  canonical?: string
  /** True when match is fuzzy/typo — ask user before saving */
  needsConfirmation?: boolean
  score?: number
  message?: string
}

interface Department {
  name: string
  municipalities: string[]
}

interface RankedMatch {
  name: string
  score: number
  exact: boolean
}

const DEPARTMENTS = guatemalaData.departments as Department[]

/** Guatemala City zones used as distrito/barrio equivalents. */
const CAPITAL_ZONES = Array.from({ length: 25 }, (_, i) => `Zona ${i + 1}`)

/** Below this → no match. At or above (and not exact) → ask confirmation. */
const FUZZY_THRESHOLD = 0.72
/** Exact-enough: accept without confirmation. */
const AUTO_ACCEPT_SCORE = 0.999

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}

export function normalizeGeo(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/\b(departamento|depto|provincia|municipio|canton|cantón|zona|colonia|barrio|aldea)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactGeo(input: string): string {
  return normalizeGeo(input).replace(/\s+/g, '')
}

function similarity(a: string, b: string): number {
  const na = normalizeGeo(a)
  const nb = normalizeGeo(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const ca = compactGeo(a)
  const cb = compactGeo(b)
  // "mix co" → "mixco" (typo/spacing) — strong but not exact
  if (ca && cb && ca === cb) return 0.97

  if (na.includes(nb) || nb.includes(na)) return 0.92

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const A = bigrams(ca.length >= 2 ? ca : na)
  const B = bigrams(cb.length >= 2 ? cb : nb)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size)
}

function rankMatches(input: string, candidates: string[]): RankedMatch[] {
  return candidates
    .map((name) => {
      const score = similarity(input, name)
      return { name, score, exact: score >= AUTO_ACCEPT_SCORE }
    })
    .filter((m) => m.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
}

function bestRanked(input: string, candidates: string[]): RankedMatch | null {
  const ranked = rankMatches(input, candidates)
  return ranked[0] ?? null
}

function toResult(match: RankedMatch | null, notFoundMessage: string): GeoValidationResult {
  if (!match) return { ok: false, message: notFoundMessage }
  return {
    ok: true,
    canonical: match.name,
    needsConfirmation: !match.exact,
    score: match.score,
  }
}

function findDepartment(name: string): Department | null {
  const match = bestRanked(name, DEPARTMENTS.map((d) => d.name))
  return match ? DEPARTMENTS.find((d) => d.name === match.name) ?? null : null
}

export function validateGuatemalaDepartment(input: string): GeoValidationResult {
  return toResult(
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
  return toResult(
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
