import { resolveFieldAlias } from './correction-fields'
import type { SurveyFieldName } from '@/types/lead'

export type CorrectionIntent =
  | { kind: 'none' }
  | { kind: 'open_menu' }
  | { kind: 'correct_field'; field: SurveyFieldName; value: string | null }

/**
 * Detect NL correction intents without calling the LLM.
 * Examples:
 *  - "quiero corregir" / "corregir una respuesta" → menu
 *  - "quiero corregir email"
 *  - "actualiza el email a ana@mail.com"
 *
 * Kept dependency-free (no DB/AI imports) — see ./detect-correction-intent-ai.ts for the
 * AI fallback, split into its own file so importing this pure function doesn't pull in
 * database client code at module-load time (flow-router.ts and unit tests import this
 * one statically).
 */
export function detectCorrectionIntent(text: string): CorrectionIntent {
  const t = text.trim()
  if (!t) return { kind: 'none' }

  const lower = t.toLowerCase()

  // Field + value first: "actualiza el email a x"
  const withValue = t.match(
    /(?:actualiza|cambia|corrige|modifica|pon)\s+(?:el\s+|la\s+|mi\s+)?(.+?)\s+(?:a|por|=|:)\s+(.+)$/i,
  )
  if (withValue) {
    const field = resolveFieldAlias(withValue[1]!.trim())
    const value = withValue[2]!.trim()
    if (field && value) return { kind: 'correct_field', field, value }
  }

  // Field without value: "quiero corregir email" / "cambiar departamento"
  const withoutValue = t.match(
    /(?:quiero\s+)?(?:corregir|cambiar|actualizar|modificar|editar)\s+(?:el\s+|la\s+|mi\s+)?(.+)$/i,
  )
  if (withoutValue) {
    const rest = withoutValue[1]!.trim()
    // Avoid treating "una respuesta" as a field → menu instead
    if (!/^(una\s+)?respuesta$/i.test(rest)) {
      const field = resolveFieldAlias(rest)
      if (field) return { kind: 'correct_field', field, value: null }
    }
  }

  // Generic menu — only when the user asks to correct (no spam buttons in survey)
  if (
    /^(quiero\s+)?(corregir|cambiar|modificar|actualizar|editar)(\s+(una\s+)?respuesta)?$/i.test(
      lower,
    ) ||
    /corregir\s+(una\s+)?respuesta/i.test(lower) ||
    /cambiar\s+(una\s+)?respuesta/i.test(lower) ||
    /me\s+equivoqu[eé]/i.test(lower)
  ) {
    return { kind: 'open_menu' }
  }

  return { kind: 'none' }
}
