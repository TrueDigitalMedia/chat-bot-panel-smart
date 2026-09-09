/**
 * CAM regression harness — see specs/regression/cam-regression-analysis.md.
 *
 * Golden-master / characterization harness: drives whole CAM conversations in-process
 * through `routeMessage`, capturing the outbound transcript + final DB state so a
 * snapshot can be pinned BEFORE features 014/015 and asserted unchanged AFTER.
 *
 * The `vi.mock(...)` calls live in cam-golden-master.test.ts (hoisting). This module
 * holds the shared capture buffer, the DB reset, the journey runner, and the snapshot
 * serializer.
 */
import { expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { outbox, extractionScript, type OutboundEntry } from './cam-outbox'

export { outbox, extractionScript, type OutboundEntry } from './cam-outbox'
export { telegramSendMockFactory, extractFieldMockFactory } from './cam-outbox'
import { db } from '@/lib/db/client'
import {
  leads,
  surveyProfiles,
  flowStates,
  conversationMessages,
  consentEvents,
  fichaHogarProfiles,
  reEngagementSchedules,
  systemCallLogs,
  treintaPanelistRecords,
  treintaPanelistEmbeddings,
  conversationEvals,
  panelSmartSyncAttempts,
  leadMessageVariantUsage,
} from '@/lib/db/schema'
import { upsertLead } from '@/lib/db/leads'
import { logConversationMessage } from '@/lib/db/conversation-messages'
import { routeMessage } from '@/lib/conversation/flow-router'
import type { ChannelInbound } from '@/types/channel'

/* ------------------------------------------------------------------ */
/* DB reset                                                            */
/* ------------------------------------------------------------------ */

/** Truncate every per-lead table. Call in `beforeEach`. Order respects FKs. */
export async function resetLeadTables(): Promise<void> {
  await db.delete(conversationMessages)
  await db.delete(consentEvents)
  await db.delete(reEngagementSchedules)
  await db.delete(fichaHogarProfiles)
  await db.delete(flowStates)
  await db.delete(surveyProfiles)
  await db.delete(systemCallLogs)
  await db.delete(treintaPanelistEmbeddings)
  await db.delete(treintaPanelistRecords)
  await db.delete(conversationEvals)
  await db.delete(panelSmartSyncAttempts)
  await db.delete(leadMessageVariantUsage)
  await db.delete(leads)
  // quota_targets / quota_region_caps are seeded once per file — see cam-journeys.ts seedQuota()
}

/* ------------------------------------------------------------------ */
/* Journey definition + runner                                         */
/* ------------------------------------------------------------------ */

export interface Turn {
  /** Inbound text, OR... */
  text?: string
  /** ...a button callback, OR... */
  callbackData?: string
  /** ...a shared Telegram location. */
  location?: { latitude: number; longitude: number }
  /** ...a shared contact phone. */
  contactPhone?: string
  /** Fields the (mocked) LLM should "extract" from this turn's text. */
  extract?: Record<string, unknown>
}

export interface Journey {
  name: string
  /** Distinct per journey so parallel files don't collide. */
  channelUserId: string
  turns: Turn[]
}

export interface JourneySnapshot {
  transcript: OutboundEntry[]
  lead: Record<string, unknown>
  surveyProfile: Record<string, unknown> | null
}

const STRIP_KEYS = new Set([
  'id',
  'leadId',
  'lead_id',
  'createdAt',
  'updatedAt',
  'lastActivityAt',
  'completedAt',
  'tdmRegistrationRequestedAt',
  'panelSmartLastSyncAt',
  'createdAtUtc',
])

function scrub<T extends Record<string, unknown>>(row: T | undefined | null): Record<string, unknown> | null {
  if (!row) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (STRIP_KEYS.has(k)) continue
    out[k] = v instanceof Date ? '<date>' : v
  }
  return out
}

/**
 * Runs one journey against the real DB + real domain code (mocks installed by the test
 * file), returns the scrubbed snapshot.
 */
export async function runJourney(j: Journey): Promise<JourneySnapshot> {
  outbox.length = 0
  const lead0 = await upsertLead('telegram', j.channelUserId, 'regression')

  for (const turn of j.turns) {
    // load scripted extraction for this turn
    for (const k of Object.keys(extractionScript)) delete extractionScript[k]
    Object.assign(extractionScript, turn.extract ?? {})

    const inbound: ChannelInbound = {
      channel: 'telegram',
      channelUserId: j.channelUserId,
      channelUsername: 'regression',
      text: turn.text ?? '',
      callbackData: turn.callbackData,
      contactPhone: turn.contactPhone,
      location: turn.location,
    }

    // Mirror the real webhook route (src/app/api/webhooks/telegram/route.ts): it logs the
    // inbound message BEFORE calling routeMessage. Without this, countOutboundSinceLastInbound
    // (messaging/send.ts) never sees an inbound row, so the outbound-without-reply circuit
    // breaker trips permanently after MAX_OUTBOUND_WITHOUT_REPLY sends across the whole
    // journey and every later turn's replies get silently suppressed.
    if (turn.callbackData) {
      await logConversationMessage({
        leadId: lead0.id,
        direction: 'in',
        channel: 'telegram',
        contentType: 'callback',
        body: turn.callbackData,
      })
    } else if (turn.contactPhone) {
      await logConversationMessage({
        leadId: lead0.id,
        direction: 'in',
        channel: 'telegram',
        contentType: 'contact',
        body: turn.contactPhone,
      })
    } else if (turn.location) {
      await logConversationMessage({
        leadId: lead0.id,
        direction: 'in',
        channel: 'telegram',
        contentType: 'system',
        body: 'location_shared',
        meta: { hasLocation: true },
      })
    } else if (turn.text) {
      await logConversationMessage({
        leadId: lead0.id,
        direction: 'in',
        channel: 'telegram',
        contentType: 'text',
        body: turn.text,
      })
    }

    // reload the lead each turn (status/phase mutate)
    const [lead] = await db.select().from(leads).where(eq(leads.id, lead0.id))
    await routeMessage(lead as never, inbound, 'test-corr')
  }

  const [finalLead] = await db.select().from(leads).where(eq(leads.id, lead0.id))
  const [profile] = await db
    .select()
    .from(surveyProfiles)
    .where(eq(surveyProfiles.leadId, lead0.id))

  return {
    transcript: [...outbox],
    lead: scrub(finalLead as Record<string, unknown>)!,
    surveyProfile: scrub(profile as Record<string, unknown>),
  }
}

/** Convenience: run + snapshot in one call. */
export async function expectJourneySnapshot(j: Journey): Promise<void> {
  const snap = await runJourney(j)
  expect(snap).toMatchSnapshot()
}
