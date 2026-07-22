import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import { PHASE2_CODE_DELAY_SECONDS } from '@/lib/scheduler/constants'
import { appBaseUrl } from '@/lib/env'
import type { Lead } from '@/types/lead'

export async function handlePhase2(lead: Lead, _correlationId: string): Promise<void> {
  const chatId = lead
  const base = appBaseUrl()
  const iosLink = `${base}/mock/app/ios`
  const androidLink = `${base}/mock/app/android`

  await db.update(leads).set({ currentPhase: 2, updatedAt: new Date() }).where(eq(leads.id, lead.id))

  await sendText(
    chatId,
    `🎉 ¡Felicidades! Tienes un cupo disponible.\n\n` +
      `Descarga la app (mock):\n📱 iOS: ${iosLink}\n🤖 Android: ${androidLink}\n\n` +
      `Una vez “descargada”, recibirás un código de registro simulado.`,
  )

  // Schedule job to trigger mock registration code delivery. Caught — a QStash/network
  // hiccup here must never throw back through handlePhase1's caller and 500 the whole
  // turn, which would silently swallow the felicidades+link message just sent above
  // (the web channel's HTTP response IS that message; the client never re-fetches full
  // history except on page load, so a 500 here made the link look like it was never sent).
  const delay = Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) || PHASE2_CODE_DELAY_SECONDS
  await scheduleJob(lead.id, 2, 0, delay, 'trigger_code').catch((err) => {
    console.error('[phase-2] scheduleJob(trigger_code) failed', { leadId: lead.id, err: String(err) })
  })
}
