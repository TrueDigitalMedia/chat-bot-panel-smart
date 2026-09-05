import { eq } from 'drizzle-orm'
import { createHash } from 'crypto'
import { db } from '@/lib/db/client'
import { leads as leadsTable, surveyProfiles } from '@/lib/db/schema'
import { resolveRoom } from '@/lib/web/chat-rooms'
import { getCountryConfig, isSupportedCountry } from '@/lib/countries/registry'

export type RoomEntryOutcome = 'applied' | 'existing_lead_ignored' | 'degraded' | 'no_room'

/**
 * Applies the `/api/chat/web?room=<slug>` param per
 * contracts/web-bootstrap-room-param.md. Only ever touches `survey_profiles.country` and
 * `leads.acquisition_source`, and only for a brand-new conversation (branch 3) — never
 * re-scopes an existing lead (branch 2). Logs `web_room_entry` with the outcome in every
 * branch and returns it. Idempotent: a second call on a now-scoped brand-new lead hits
 * branch 2.
 */
export async function applyRoomParam(
  leadId: string,
  channelUserId: string,
  slug: string | null,
  existingMessageCount: number,
): Promise<{ outcome: RoomEntryOutcome; country: string | null }> {
  if (!slug) return { outcome: 'no_room', country: null }

  const sessionHash = createHash('sha256').update(channelUserId).digest('hex').slice(0, 12)

  const [profile] = await db
    .select({ country: surveyProfiles.country })
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, leadId))
    .limit(1)

  // Branch 2 — not a brand-new conversation: ignore the room entirely.
  if (existingMessageCount > 0 || profile?.country) {
    console.info('[web] web_room_entry', {
      outcome: 'existing_lead_ignored',
      slug,
      session_id_hash: sessionHash,
      resolved_country: null,
    })
    return { outcome: 'existing_lead_ignored', country: null }
  }

  // Branch 3 — brand-new conversation.
  const country = resolveRoom(slug)
  const configured = country != null && isSupportedCountry(country) && getCountryConfig(country).country === country
  if (!configured) {
    console.info('[web] web_room_entry', {
      outcome: 'degraded',
      slug,
      session_id_hash: sessionHash,
      resolved_country: country,
    })
    return { outcome: 'degraded', country: null }
  }

  await db.update(surveyProfiles).set({ country: country! }).where(eq(surveyProfiles.leadId, leadId))
  await db
    .update(leadsTable)
    .set({ acquisitionSource: `web:room:${country}`, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))
  console.info('[web] web_room_entry', {
    outcome: 'applied',
    slug,
    session_id_hash: sessionHash,
    resolved_country: country,
  })
  return { outcome: 'applied', country: country! }
}
