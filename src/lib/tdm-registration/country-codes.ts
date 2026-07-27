/**
 * Maps the exact country names the survey stores (src/lib/conversation/survey-questions.ts
 * Q2 button labels — literally what lands in survey_profiles.country) to the ISO-ish
 * codes TDM's request JSON wants. Note the literal is 'Rep. Dominicana', not
 * 'República Dominicana' — get this wrong and every DO lead silently gets a null code.
 */
const COUNTRY_CODES: Record<string, string> = {
  Guatemala: 'GT',
  Honduras: 'HN',
  'El Salvador': 'SV',
  Nicaragua: 'NI',
  'Costa Rica': 'CR',
  'Rep. Dominicana': 'DO',
  Panamá: 'PA',
}

/** Returns null (never throws) for an unrecognized name — logged so it's never silent. */
export function countryCodeFor(countryName: string | null): string | null {
  if (!countryName) return null
  const code = COUNTRY_CODES[countryName]
  if (!code) {
    console.warn('[tdm-registration] unrecognized country name, no code mapped', { countryName })
    return null
  }
  return code
}
