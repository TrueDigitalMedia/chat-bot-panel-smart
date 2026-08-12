import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { sendInlineKeyboard } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import { PHASE2_CODE_DELAY_SECONDS } from '@/lib/scheduler/constants'
import { APP_DOWNLOADED_CALLBACK } from '@/lib/onboarding/app-downloaded'
import { IOS_APP_LINK, ANDROID_APP_LINK, PHASE2_AGENT_INTRO } from '../exit-messages'
import type { Lead } from '@/types/lead'

export async function handlePhase2(lead: Lead, _correlationId: string): Promise<void> {
  const chatId = lead

  await db.update(leads).set({ currentPhase: 2, updatedAt: new Date() }).where(eq(leads.id, lead.id))

  await sendInlineKeyboard(
    chatId,
    `🎉 ¡Felicidades! Tienes un cupo disponible.\n\n` +
      `${PHASE2_AGENT_INTRO}\n\n` +
      `Descarga la app:\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}\n\n` +
      `Una vez descargada, recibirás tu código de registro.`,
    [[{ text: '📲 Ya la descargué', callback_data: APP_DOWNLOADED_CALLBACK }]],
  )

  // Schedule the job that requests the registration code from TDM (or delivers a mock
  // one, per REGISTRATION_CODE_MOCK_ENABLED — see jobs/re-engage.ts). Caught — a
  // QStash/network hiccup here must never throw back through handlePhase1's caller and
  // 500 the whole turn, which would silently swallow the felicidades+link message just
  // sent above (the web channel's HTTP response IS that message; the client never
  // re-fetches full history except on page load, so a 500 here made the link look like
  // it was never sent).
  const delay = Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) || PHASE2_CODE_DELAY_SECONDS
  await scheduleJob(lead.id, 2, 0, delay, 'request_registration_code').catch((err) => {
    console.error('[phase-2] scheduleJob(request_registration_code) failed', { leadId: lead.id, err: String(err) })
  })

  // The "haven't downloaded the app yet" nudge is no longer scheduled here as its own
  // one-off job — it's now covered by the unified recontact mechanism (scheduleRecontact
  // in src/lib/scheduler/re-engagement.ts), armed by flow-router.ts right after this
  // function returns (handlePhase2 is only ever called synchronously from phase-1.ts).
}
