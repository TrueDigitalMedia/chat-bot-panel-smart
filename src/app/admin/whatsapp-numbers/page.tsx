import { listWhatsAppNumbers } from '@/lib/whatsapp/number-registry'
import { env } from '@/lib/env'

// Spec 017 US4 — read-only view of the configured WhatsApp business numbers (all under
// one shared WABA), which country each is scoped to, and its Meta messaging tier when
// available. Numbers are configured via WHATSAPP_NUMBER_MAP (env) — this page never writes.
export const dynamic = 'force-dynamic'

interface NumberMeta {
  displayPhoneNumber?: string
  messagingLimitTier?: string
  qualityRating?: string
}

// Per-instance cache so a Meta hiccup or a page refresh storm doesn't hammer the Graph API.
const metaCache = new Map<string, { at: number; value: NumberMeta }>()
const TTL_MS = 5 * 60 * 1000

async function fetchNumberMeta(phoneNumberId: string): Promise<NumberMeta> {
  const cached = metaCache.get(phoneNumberId)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value

  const value: NumberMeta = {}
  try {
    const version = env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'
    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,messaging_limit_tier,quality_rating`,
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }, cache: 'no-store' },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        display_phone_number?: string
        messaging_limit_tier?: string
        quality_rating?: string
      }
      value.displayPhoneNumber = data.display_phone_number
      value.messagingLimitTier = data.messaging_limit_tier
      value.qualityRating = data.quality_rating
    }
  } catch {
    // best-effort — leave value empty, the row shows "no disponible"
  }
  metaCache.set(phoneNumberId, { at: Date.now(), value })
  return value
}

export default async function AdminWhatsAppNumbersPage() {
  const numbers = listWhatsAppNumbers()
  const withMeta = await Promise.all(
    numbers.map(async (n) => ({ ...n, meta: await fetchNumberMeta(n.phoneNumberId) })),
  )

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Números de WhatsApp por país</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Todos los números viven bajo la misma cuenta de WhatsApp Business (WABA compartida): un solo
        token, un solo secreto de firma y un mismo inventario de plantillas aprobadas. Un mensaje que
        llega a un número con país asignado queda marcado con ese país y no se le pregunta «¿En qué
        país…?». El número «genérico» sigue preguntando. Se configuran con <code>WHATSAPP_NUMBER_MAP</code>.
      </p>

      <table className="mt-4 w-full max-w-3xl text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            <th className="py-2 pr-4">Número</th>
            <th className="py-2 pr-4">País</th>
            <th className="py-2 pr-4">Límite de mensajería</th>
            <th className="py-2">Calidad</th>
          </tr>
        </thead>
        <tbody>
          {withMeta.map((n) => (
            <tr key={n.phoneNumberId} className="border-border/60 border-b">
              <td className="py-2 pr-4">
                <code className="break-all">{n.meta.displayPhoneNumber ?? n.phoneNumberId}</code>
                {n.isDefault ? (
                  <span className="text-muted-foreground ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                    predeterminado
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-4">{n.country ?? 'genérico — pregunta país'}</td>
              <td className="py-2 pr-4">{n.meta.messagingLimitTier ?? 'no disponible'}</td>
              <td className="py-2">{n.meta.qualityRating ?? 'no disponible'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
