import type { InlineKeyboardButton } from '@/types/telegram'

export type WaChoiceMap = Record<string, string>

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
