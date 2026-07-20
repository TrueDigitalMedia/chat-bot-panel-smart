import type { InlineKeyboardButton } from '@/types/telegram'

const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

function normalize(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RE, '').trim().toLowerCase()
}

/**
 * Best-effort match of free text against a button-type question's options, for users
 * who type an answer ("si", "No") instead of tapping the inline keyboard — the bot
 * previously just silently re-asked the question in this case (no interpretation
 * attempted at all). Matches, in order: 1-based numeric position (e.g. "1"), then an
 * exact normalized (accent-stripped, case-insensitive) label match against the
 * button's own text. Scoped to the current question's own buttons, so there's no
 * cross-question ambiguity. Returns the matched button's callback_data, or null.
 */
export function matchButtonChoice(buttons: InlineKeyboardButton[][], text: string): string | null {
  const normalized = normalize(text)
  if (!normalized) return null

  const flat = buttons.flat()

  if (/^\d+$/.test(normalized)) {
    const byIndex = flat[Number(normalized) - 1]
    if (byIndex) return byIndex.callback_data
  }

  const byLabel = flat.find((b) => normalize(b.text) === normalized)
  return byLabel?.callback_data ?? null
}
