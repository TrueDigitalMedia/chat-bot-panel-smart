import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import { PHASE2_CODE_DELAY_SECONDS } from '@/lib/scheduler/constants'
import type { Lead } from '@/types/lead'

function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '')
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

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

  // Schedule job to trigger mock registration code delivery
  const delay = Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) || PHASE2_CODE_DELAY_SECONDS
  await scheduleJob(lead.id, 2, 0, delay, 'trigger_code')
}
