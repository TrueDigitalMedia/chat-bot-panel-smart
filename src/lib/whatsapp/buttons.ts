import type { InlineKeyboardButton } from '@/types/telegram'

export type WaChoiceMap = Record<string, string>

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * WhatsApp list rows cap `title` at 24 chars — a naive slice on long option text
 * (e.g. "Tabla/madera, techo de desechos o cartón") cuts it off mid-word. Split on
 * the first comma so `title` holds the short category and `description` (72-char
 * cap) carries the detail, instead of losing it to truncation.
 */
export function splitListRow(text: string, titleMax = 24, descriptionMax = 72): {
  title: string
  description?: string
} {
  const t = text.trim()
  if (t.length <= titleMax) return { title: t }

  const commaIndex = t.indexOf(',')
  if (commaIndex > 0 && commaIndex <= titleMax) {
    return {
      title: t.slice(0, commaIndex).trim(),
      description: truncate(t.slice(commaIndex + 1), descriptionMax),
    }
  }

  return { title: truncate(t, titleMax), description: truncate(t, descriptionMax) }
}

/**
 * Flatten inline keyboard into numbered text + lookup map.
 * Keys: "1", "2", … and lowercase button labels.
 */
export function buildNumberedChoices(buttons: InlineKeyboardButton[][]): {
  bodySuffix: string
  choices: WaChoiceMap
} {
  const flat = buttons.flat()
  const choices: WaChoiceMap = {}
  const lines: string[] = []

  flat.forEach((b, i) => {
    const n = String(i + 1)
    choices[n] = b.callback_data
    choices[b.text.trim().toLowerCase()] = b.callback_data
    lines.push(`${n}) ${b.text}`)
  })

  return {
    bodySuffix: lines.length ? `\n\nResponde con el número o el texto:\n${lines.join('\n')}` : '',
    choices,
  }
}
