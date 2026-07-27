import { z } from 'zod'

/**
 * z.coerce.boolean() is a footgun for env vars: it coerces via JS's native Boolean(),
 * so ANY non-empty string — including the literal "false" — becomes `true`. This parses
 * the actual text instead, so "false"/"0" (case-insensitive) correctly become `false`.
 */
export function boolEnv(defaultValue: boolean) {
  return z.preprocess((val) => {
    if (val === undefined) return defaultValue
    if (typeof val === 'string') return !['false', '0', ''].includes(val.trim().toLowerCase())
    return val
  }, z.boolean())
}
