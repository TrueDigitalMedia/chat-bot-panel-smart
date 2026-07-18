import { env, isMetaWhatsAppConfigured } from '@/lib/env'

export function requireMeta(): void {
  if (!isMetaWhatsAppConfigured()) {
    throw new Error(
      'WhatsApp Business (Meta) is not configured (set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET)',
    )
  }
}

export function graphMessagesUrl(): string {
  requireMeta()
  const version = env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'
  return `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

export async function graphSend(payload: Record<string, unknown>): Promise<string | undefined> {
  requireMeta()
  const res = await fetch(graphMessagesUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string; code?: number }
  }
  if (!res.ok) {
    throw new Error(
      `Meta Graph error: ${res.status} ${data.error?.message ?? JSON.stringify(data)}`,
    )
  }
  return data.messages?.[0]?.id
}
