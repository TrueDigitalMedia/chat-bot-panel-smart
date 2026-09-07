import type { InlineKeyboardButton } from '@/types/telegram'

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')
const PAREN_RE = /\([^)]*\)/g

function normalize(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RE, '').trim().toLowerCase()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function valueOf(b: InlineKeyboardButton): string {
  return b.callback_data.split(':').slice(1).join(':').trim()
}

// Trivial affirmations / negations users type instead of tapping a Sí/No button.
const YES_WORDS = new Set([
  'si', 'sii', 'sip', 'sipo', 'sisi', 'claro', 'dale', 'ok', 'oka', 'okay', 'okey',
  'correcto', 'afirmativo', 'asi es', 'de acuerdo', 'confirmo', 'acepto', 'yes',
])
const NO_WORDS = new Set(['no', 'nop', 'nel', 'negativo', 'para nada', 'nunca', 'jamas'])
// Trivial "none / zero" answers → the 0 button.
const NONE_WORDS = new Set([
  'ninguno', 'ninguna', 'nada', 'cero', 'ni uno', 'ni una', 'no tengo', 'no hay',
  'no tengo ninguno', 'ninguno de esos',
])

function isYesButton(b: InlineKeyboardButton): boolean {
  const cb = b.callback_data.toLowerCase()
  return normalize(b.text) === 'si' || /:(accept|yes|true)$/.test(cb)
}
function isNoButton(b: InlineKeyboardButton): boolean {
  const cb = b.callback_data.toLowerCase()
  return normalize(b.text) === 'no' || /:(decline|no|false)$/.test(cb)
}

/**
 * Best-effort match of free text against a button-type question's options, for users
 * who type an answer ("si", "No", "2", "ninguno") instead of tapping the inline
 * keyboard — the bot previously just silently re-asked in this case, or forced an LLM
 * call that fails ~15% of the time.
 *
 * Order: (1) a bare number → the button whose *value* is that number (not its
 * position — "1" on a 0/1/2 car list means one car, callback `cars:1`), falling back
 * to 1-based position for non-numeric option lists (e.g. a numbered education list);
 * (2) exact normalized label; (3) a bare Sí/No/none word → the matching Sí/No/0
 * button when the question has one; (4) the label's core text found as a whole word.
 * Scoped to the current question's own buttons. Returns the callback_data, or null.
 */
export function matchButtonChoice(buttons: InlineKeyboardButton[][], text: string): string | null {
  const normalized = normalize(text)
  if (!normalized) return null

  const flat = buttons.flat()

  if (/^\d+$/.test(normalized)) {
    const n = Number(normalized)
    // Match the button whose value starts with this number ("2 o más" → 2), so "2" on
    // a 0/1/2 list is two, not the 2nd button. Only fall back to 1-based position when
    // no button carries a numeric value (e.g. a numbered education list).
    const anyNumericValues = flat.some((b) => /^\d/.test(valueOf(b)))
    const byValue = anyNumericValues
      ? flat.find((b) => {
          const lead = valueOf(b).match(/^\d+/)
          return lead != null && Number(lead[0]) === n
        })
      : undefined
    if (byValue) return byValue.callback_data
    if (!anyNumericValues) {
      const byIndex = flat[n - 1]
      if (byIndex) return byIndex.callback_data
    }
  }

  const byLabel = flat.find((b) => normalize(b.text) === normalized)
  if (byLabel) return byLabel.callback_data

  if (YES_WORDS.has(normalized)) {
    const b = flat.find(isYesButton)
    if (b) return b.callback_data
  }
  // "ninguno" / "no tengo" → the 0 button if the question has one (cars, petCount),
  // otherwise treat it as a plain negation for a Sí/No question.
  if (NONE_WORDS.has(normalized)) {
    const zero = flat.find((x) => valueOf(x) === '0' || normalize(x.text) === '0')
    if (zero) return zero.callback_data
  }
  if (NO_WORDS.has(normalized) || NONE_WORDS.has(normalized)) {
    const b = flat.find(isNoButton)
    if (b) return b.callback_data
  }

  const byCoreWord = flat.find((b) => {
    const core = normalize(b.text.replace(PAREN_RE, ''))
    if (core.length < 4) return false
    return new RegExp(`\\b${escapeRegExp(core)}\\b`).test(normalized)
  })
  return byCoreWord?.callback_data ?? null
}
