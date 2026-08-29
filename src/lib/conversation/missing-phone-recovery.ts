import { normalizePhone } from '@/lib/phone'
import { sendText } from '@/lib/messaging/send'
import { applyPhoneRemediation, LINK_SENT_TIMEOUT_REASONS } from '@/lib/db/leads'
import { requestRegistrationCodeForLead } from '@/lib/onboarding/request-registration-code'
import type { Lead, LeadStatus } from '@/types/lead'

const MISSING_PHONE_PROMPT =
  'Para enviarte tu código de registro necesitamos tu número de teléfono — no pudimos detectarlo automáticamente. ' +
  '¿Nos lo compartes con código de país? (ej. +18095551234)'

/**
 * True for a WhatsApp lead stuck waiting on a registration code purely because it never
 * had a real phone number to send TDM — the BSUID case (Twilio sends a Business-Scoped
 * User ID instead of a phone number for users on WhatsApp's newer username/privacy
 * feature; see phone.ts's channelRequiresPhonePrompt for the full writeup). Leads created
 * after that fix always get asked for their phone up front and never reach this state;
 * this only still applies to leads whose phone-capture step ran before the fix shipped.
 */
export function isMissingPhoneForRegistration(lead: Lead): boolean {
  if (lead.channel !== 'whatsapp' || lead.phoneNumber) return false
  const status = lead.leadStatus as LeadStatus
  return status === 'link_sent' || (status === 'abandono' && LINK_SENT_TIMEOUT_REASONS.has(lead.statusReason ?? ''))
}

/**
 * Handles one turn for a lead in the situation above — this is what a user asking "¿cuál
 * es mi código?" or tapping "Ya la descargué" while phone-less actually needs, not the
 * generic "still processing" reminder or a decline-flavored reply. A phone-shaped reply
 * saves it, resumes at `link_sent`, and retries the registration code request that could
 * never have succeeded without one (it originally failed with "Campos requeridos
 * faltantes: telefono"). Anything else — no text, a stray button tap, an unparseable
 * reply — re-sends the same prompt explaining why we're asking. Always handles the turn;
 * caller should treat this as terminal for that turn.
 */
export async function handleMissingPhoneRecovery(
  lead: Lead,
  messageText: string,
  correlationId: string,
): Promise<void> {
  const phone = messageText.trim() ? normalizePhone(messageText) : null
  if (!phone) {
    await sendText(lead, MISSING_PHONE_PROMPT)
    return
  }
  const updated = await applyPhoneRemediation(lead.id, phone)
  await sendText(updated, `✅ Número guardado: ${phone}`)
  await requestRegistrationCodeForLead(updated, 2, correlationId)
}
