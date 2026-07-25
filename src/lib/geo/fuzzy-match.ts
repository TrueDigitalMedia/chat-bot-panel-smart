/**
 * Country-agnostic fuzzy string matching for geo field validation (department/
 * province/municipality names). Shared by guatemala.ts (curated dataset) and
 * country-catalog.ts (the other 6 CAM/RD countries, derived from the NSE catalog).
 */

export interface GeoValidationResult {
  ok: boolean
  /** Canonical official name when matched */
  canonical?: string
  /** True when match is fuzzy/typo — ask user before saving */
  needsConfirmation?: boolean
  score?: number
  message?: string
}

export interface RankedMatch {
  name: string
  score: number
  exact: boolean
}

/** Below this → no match. At or above (and not exact) → ask confirmation. */
export const FUZZY_THRESHOLD = 0.72
/** Exact-enough: accept without confirmation. */
export const AUTO_ACCEPT_SCORE = 0.999

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

export function similarity(a: string, b: string): number {
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

export function rankMatches(input: string, candidates: string[]): RankedMatch[] {
  return candidates
    .map((name) => {
      const score = similarity(input, name)
      return { name, score, exact: score >= AUTO_ACCEPT_SCORE }
    })
    .filter((m) => m.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
}

export function bestRanked(input: string, candidates: string[]): RankedMatch | null {
  const ranked = rankMatches(input, candidates)
  return ranked[0] ?? null
}

export function toGeoResult(match: RankedMatch | null, notFoundMessage: string): GeoValidationResult {
  if (!match) return { ok: false, message: notFoundMessage }
  return {
    ok: true,
    canonical: match.name,
    needsConfirmation: !match.exact,
    score: match.score,
  }
}
