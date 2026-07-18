import type { InlineKeyboardButton } from '@/types/telegram'
import { buildNumberedChoices, type WaChoiceMap } from '@/lib/whatsapp/buttons'
import { toMetaRecipient } from '@/lib/whatsapp/phone'
import { graphSend, requireMeta } from '@/lib/whatsapp/providers/meta/graph'

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export async function sendMetaText(
  channelUserId: string,
  text: string,
): Promise<string | undefined> {
  requireMeta()
  const to = toMetaRecipient(channelUserId)
  console.info('[whatsapp:meta:out]', { to, type: 'text', len: text.length })
  try {
    const id = await graphSend({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    })
    console.info('[whatsapp:meta:out] ok', { to, id })
    return id
  } catch (err) {
    console.error('[whatsapp:meta:out] error', {
      to,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export async function sendMetaVideo(
  channelUserId: string,
  videoUrl: string,
  caption?: string,
): Promise<string | undefined> {
  requireMeta()
  const to = toMetaRecipient(channelUserId)
  console.info('[whatsapp:meta:out]', { to, type: 'video', videoUrl })
  try {
    const id = await graphSend({
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: {
        link: videoUrl,
        caption: caption ? truncate(caption, 1024) : undefined,
      },
    })
    console.info('[whatsapp:meta:out] ok', { to, id })
    return id
  } catch (err) {
    console.warn('[whatsapp:meta:out] video failed — link fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    return sendMetaText(channelUserId, caption ? `${caption}\n${videoUrl}` : videoUrl)
  }
}

/**
 * Reply buttons (≤3) or list (4–10). Falls back to numbered text.
 */
export async function sendMetaKeyboard(
  channelUserId: string,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<{ sid?: string; choices: WaChoiceMap }> {
  const flat = buttons.flat()
  const { choices } = buildNumberedChoices(buttons)
  const to = toMetaRecipient(channelUserId)

  try {
    requireMeta()
    if (flat.length > 0 && flat.length <= 3) {
      const id = await graphSend({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: truncate(text, 1024) },
          action: {
            buttons: flat.map((b) => ({
              type: 'reply',
              reply: {
                id: truncate(b.callback_data, 256),
                title: truncate(b.text, 20),
              },
            })),
          },
        },
      })
      console.info('[whatsapp:meta:out] ok', { to, type: 'button', id, n: flat.length })
      return { sid: id, choices }
    }

    if (flat.length <= 10) {
      const id = await graphSend({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: truncate(text, 1024) },
          action: {
            button: 'Elegir',
            sections: [
              {
                title: 'Opciones',
                rows: flat.map((b) => ({
                  id: truncate(b.callback_data, 200),
                  title: truncate(b.text, 24),
                })),
              },
            ],
          },
        },
      })
      console.info('[whatsapp:meta:out] ok', { to, type: 'list', id, n: flat.length })
      return { sid: id, choices }
    }

    const { bodySuffix } = buildNumberedChoices(buttons)
    const sid = await sendMetaText(channelUserId, `${text}${bodySuffix}`)
    return { sid, choices }
  } catch (err) {
    console.warn('[whatsapp:meta:out] interactive failed — numbered fallback', {
      error: err instanceof Error ? err.message : String(err),
    })
    const { bodySuffix } = buildNumberedChoices(buttons)
    const sid = await sendMetaText(channelUserId, `${text}${bodySuffix}`)
    return { sid, choices }
  }
}
