import { env } from '@/lib/env'
import type {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  ReplyKeyboardMarkup,
  ReplyKeyboardRemove,
} from '@/types/telegram'

const BASE = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`

function preview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}

async function telegramPost(method: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('[telegram:out] error', { method, status: res.status, body: text })
    throw new Error(`Telegram API error (${method}): ${res.status} ${text}`)
  }
}

export async function sendText(chatId: bigint | number, text: string): Promise<void> {
  console.info('[telegram:out]', {
    chatId: chatId.toString(),
    type: 'text',
    text: preview(text),
  })
  try {
    await telegramPost('sendMessage', {
      chat_id: chatId.toString(),
      text,
      parse_mode: 'Markdown',
    })
  } catch {
    // Retry plain text if Markdown entities are invalid
    await telegramPost('sendMessage', {
      chat_id: chatId.toString(),
      text,
    })
  }
}

export async function sendVideo(
  chatId: bigint | number,
  video: string,
  caption?: string,
): Promise<void> {
  console.info('[telegram:out]', {
    chatId: chatId.toString(),
    type: 'video',
    video,
    caption: caption ? preview(caption) : null,
  })
  await telegramPost('sendVideo', {
    chat_id: chatId.toString(),
    video,
    ...(caption ? { caption } : {}),
  })
}

export async function sendInlineKeyboard(
  chatId: bigint | number,
  text: string,
  buttons: InlineKeyboardButton[][],
): Promise<void> {
  console.info('[telegram:out]', {
    chatId: chatId.toString(),
    type: 'keyboard',
    text: preview(text),
    buttons: buttons.flat().map((b) => b.callback_data ?? b.text),
  })
  const reply_markup: InlineKeyboardMarkup = { inline_keyboard: buttons }
  await telegramPost('sendMessage', {
    chat_id: chatId.toString(),
    text,
    reply_markup,
  })
}

export async function sendContactRequest(chatId: bigint | number, text: string): Promise<void> {
  console.info('[telegram:out]', {
    chatId: chatId.toString(),
    type: 'contact_request',
    text: preview(text),
  })
  const reply_markup: ReplyKeyboardMarkup = {
    keyboard: [[{ text: '📱 Compartir mi número', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  }
  await telegramPost('sendMessage', {
    chat_id: chatId.toString(),
    text,
    reply_markup,
  })
}

export async function sendLocationRequest(chatId: bigint | number, text: string): Promise<void> {
  console.info('[telegram:out]', {
    chatId: chatId.toString(),
    type: 'location_request',
    text: preview(text),
  })
  const reply_markup: ReplyKeyboardMarkup = {
    keyboard: [
      [{ text: '📍 Compartir ubicación', request_location: true }],
      [{ text: 'Escribir mi ubicación' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  }
  await telegramPost('sendMessage', {
    chat_id: chatId.toString(),
    text,
    reply_markup,
  })
}

export async function removeReplyKeyboard(chatId: bigint | number, text: string): Promise<void> {
  const reply_markup: ReplyKeyboardRemove = { remove_keyboard: true }
  await telegramPost('sendMessage', {
    chat_id: chatId.toString(),
    text,
    reply_markup,
  })
}
