import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads as leadsTable, surveyProfiles } from '@/lib/db/schema'
import { getCountryConfig, isSupportedCountry } from '@/lib/countries/registry'
import { countryForPhoneNumberId } from '@/lib/whatsapp/number-registry'

export type NumberScopeOutcome = 'applied' | 'existing_lead_ignored' | 'generic' | 'degraded'

/**
 * WhatsApp analogue of feature 016's `applyRoomParam` (spec 017). When a brand-new
 * WhatsApp conversation arrives on a country-scoped business number, pre-set
 * `survey_profiles.country` + `leads.acquisition_source = 'whatsapp:number:<country>'`
 * so the existing `nextQuestionToSend` skips the "¿En qué país…?" question and
 * `needsGpsCapture` returns false (manual geo).
 *
 * Only ever touches those two fields, and only for a brand-new conversation. Never
 * re-scopes an existing lead (FR-012). Also emits `whatsapp_inbound_number_mismatch`
 * when an existing lead messages a different number than it is bound to.
 */
export async function applyNumberScope(
  leadId: string,
  phoneNumberId: string | undefined,
  boundPhoneNumberId: string | null,
  existingMessageCount: number,
): Promise<{ outcome: NumberScopeOutcome; country: string | null }> {
  const country = countryForPhoneNumberId(phoneNumberId)

  const [profile] = await db
    .select({ country: surveyProfiles.country })
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, leadId))
    .limit(1)

  // Not a brand-new conversation — never re-scope or re-bind.
  if (existingMessageCount > 0 || profile?.country) {
    if (phoneNumberId && boundPhoneNumberId && phoneNumberId !== boundPhoneNumberId) {
      console.info(
        JSON.stringify({
          event: 'whatsapp_inbound_number_mismatch',
          lead_id: leadId,
          bound_phone_number_id: boundPhoneNumberId,
          inbound_phone_number_id: phoneNumberId,
        }),
      )
    }
    return { outcome: 'existing_lead_ignored', country: null }
  }

  if (!country) return { outcome: 'generic', country: null }

  const configured = isSupportedCountry(country) && getCountryConfig(country).country === country
  if (!configured) {
    console.warn(
      JSON.stringify({ event: 'whatsapp_number_scope_degraded', lead_id: leadId, country }),
    )
    return { outcome: 'degraded', country: null }
  }

  const acquisitionSource = `whatsapp:number:${country}`
  await db.update(surveyProfiles).set({ country }).where(eq(surveyProfiles.leadId, leadId))
  await db
    .update(leadsTable)
    .set({ acquisitionSource, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))

  console.info(
    JSON.stringify({
      event: 'whatsapp_number_scope_applied',
      lead_id: leadId,
      phone_number_id: phoneNumberId,
      country,
      acquisition_source: acquisitionSource,
    }),
  )
  return { outcome: 'applied', country }
}
