import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { scheduleJob } from '@/lib/scheduler/re-engagement'
import {
  PHASE2_CODE_DELAY_SECONDS,
  LINK_SENT_REMINDER_DELAY_SECONDS,
  LINK_SENT_REMINDER_ATTEMPT_NUMBER,
} from '@/lib/scheduler/constants'
import { IOS_APP_LINK, ANDROID_APP_LINK } from '../exit-messages'
import type { Lead } from '@/types/lead'

export async function handlePhase2(lead: Lead, _correlationId: string): Promise<void> {
  const chatId = lead

  await db.update(leads).set({ currentPhase: 2, updatedAt: new Date() }).where(eq(leads.id, lead.id))

  await sendText(
    chatId,
    `🎉 ¡Felicidades! Tienes un cupo disponible.\n\n` +
      `Descarga la app:\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}\n\n` +
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

  // If the lead goes quiet after this and never moves past link_sent, ask once more
  // whether they downloaded the app — same RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS knob
  // as the other scheduled delays above, for local testing.
  const reminderDelay =
    Number(process.env.RE_ENGAGEMENT_TIMEOUT_OVERRIDE_SECONDS) || LINK_SENT_REMINDER_DELAY_SECONDS
  await scheduleJob(lead.id, 2, LINK_SENT_REMINDER_ATTEMPT_NUMBER, reminderDelay, 'link_sent_reminder').catch(
    (err) => {
      console.error('[phase-2] scheduleJob(link_sent_reminder) failed', { leadId: lead.id, err: String(err) })
    },
  )
}
