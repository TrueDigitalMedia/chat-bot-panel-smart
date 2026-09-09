/**
 * Zero-dependency (vitest only) capture buffer + mock factories for the CAM regression
 * harness. Kept separate from cam-harness.ts so the `vi.mock` factories in
 * cam-golden-master.test.ts can import it during hoisting without pulling in the DB /
 * domain module graph.
 */
import { vi } from 'vitest'

export interface OutboundEntry {
  method: 'text' | 'keyboard' | 'video' | 'contact_request' | 'location_request' | 'remove_keyboard'
  text?: string
  buttons?: string[]
  video?: string
}

/** Shared, mutable. The telegram send mock pushes here; the runner reads + clears it. */
export const outbox: OutboundEntry[] = []

/** Set by the journey runner before each turn; read by the extractField mock. */
export const extractionScript: Record<string, unknown> = {}

export function telegramSendMockFactory() {
  const push = (e: OutboundEntry) => outbox.push(e)
  return {
    sendText: vi.fn(async (_c: unknown, text: string) => push({ method: 'text', text })),
    sendVideo: vi.fn(async (_c: unknown, video: string, caption?: string) =>
      push({ method: 'video', video, text: caption }),
    ),
    sendInlineKeyboard: vi.fn(
      async (_c: unknown, text: string, buttons: { text: string; callback_data?: string }[][]) =>
        push({ method: 'keyboard', text, buttons: buttons.flat().map((b) => b.callback_data ?? b.text) }),
    ),
    sendContactRequest: vi.fn(async (_c: unknown, text: string) => push({ method: 'contact_request', text })),
    sendLocationRequest: vi.fn(async (_c: unknown, text: string) => push({ method: 'location_request', text })),
    removeReplyKeyboard: vi.fn(async (_c: unknown, text: string) => push({ method: 'remove_keyboard', text })),
  }
}

export function extractFieldMockFactory() {
  return {
    extractField: vi.fn(async (fieldName: string) =>
      fieldName in extractionScript
        ? { ok: true as const, value: extractionScript[fieldName], correlationId: 'test' }
        : { ok: false as const, correlationId: 'test' },
    ),
  }
}
