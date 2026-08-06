import { sendText } from '@/lib/messaging/send'
import { cancelPendingJobs } from '@/lib/scheduler/re-engagement'
import { requestRegistrationCodeForLead } from './request-registration-code'
import type { Lead } from '@/types/lead'

export const APP_DOWNLOADED_CALLBACK = 'app_downloaded'

export function isAppDownloadedCallback(callbackData: string | undefined): boolean {
  return callbackData === APP_DOWNLOADED_CALLBACK
}

/**
 * "📲 Ya la descargué" button tap (phase-2.ts) — lets the user skip the scheduled
 * PHASE2_CODE_DELAY_SECONDS wait and request the registration code immediately.
 */
export async function handleAppDownloaded(lead: Lead, correlationId: string): Promise<void> {
  if (lead.leadStatus !== 'link_sent') {
    await sendText(lead, 'Este paso ya no está pendiente.')
    return
  }

  // Supersede the scheduled request_registration_code/link_sent_reminder jobs for phase
  // 2 — requestRegistrationCodeForLead below does that same work right now instead.
  await cancelPendingJobs(lead.id, 2).catch(() => {})

  await sendText(lead, '¡Perfecto! Estamos generando tu código de registro…')
  await requestRegistrationCodeForLead(lead, 2, correlationId)
}
