/**
 * One-off remediation for WhatsApp leads stuck because Twilio sent a Business-Scoped
 * User ID (BSUID, format "CC.alphanumeric", e.g. "DO.1393047009463368") instead of a
 * real phone number in `From` — a WhatsApp platform behavior rolling out since ~April
 * 2026 for users on Meta's newer username/privacy feature. Before phone.ts's
 * channelRequiresPhonePrompt fix, the bot never asked these leads for their phone, so
 * `leads.phone_number` stayed null and the registration code request to TDM failed with
 * "Campos requeridos faltantes: telefono", eventually landing the lead in `abandono`.
 * See that fix's commit for the full root-cause writeup.
 *
 * This script only ever *reports* by default. Nothing is sent or written to the
 * database unless you pass --send.
 *
 * Usage:
 *   npx tsx scripts/remediate-bsuid-phone-leads.ts              # dry run — report only
 *   npx tsx scripts/remediate-bsuid-phone-leads.ts --send        # actually message + mark category A leads
 *
 * What --send does, and does NOT do:
 *   - Category A (clean case: abandono / TDM-timeout reason / no phone / BSUID id /
 *     survey already completed): sends each lead a WhatsApp message asking for their
 *     phone number, then marks them with PHONE_REMEDIATION_PENDING_REASON so their next
 *     reply is picked up by flow-router.ts's dedicated branch (validates the number,
 *     saves it, retries the registration code request).
 *   - Category B (mid-survey, already past the phone gate, will hit the same wall once
 *     they finish) and Category C (a BSUID's digits got misread as a real phone number
 *     and actually saved — a *wrong* number, possibly already submitted to TDM) are only
 *     ever reported, never touched automatically — both need a human judgment call
 *     Category B: is it safe to interrupt an in-progress conversation right now?
 *     Category C: did TDM actually act on the wrong number, and does that need
 *     correcting on their side too, not just ours?
 */
import { eq, like } from 'drizzle-orm'
import type { ChannelRecipient } from '@/types/channel'

for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // optional
  }
}

const BSUID_PATTERN = /^[A-Z]{2}\.\d+$/

interface LeadRow {
  id: string
  leadStatus: string
  statusReason: string | null
  currentPhase: number
  d3IsShopper: boolean | null
  surveyQuestionIndex: number
  phoneNumber: string | null
  channelUserId: string
  fullName: string | null
  createdAt: Date
  lastActivityAt: Date
}

function digitsOf(s: string): string {
  return s.replace(/\D/g, '')
}

async function main(): Promise<void> {
  const send = process.argv.includes('--send')

  const { db } = await import('@/lib/db/client')
  const { leads, surveyProfiles } = await import('@/lib/db/schema')
  const { LINK_SENT_TIMEOUT_REASONS, markLeadForPhoneRemediation } = await import('@/lib/db/leads')
  const { sendText } = await import('@/lib/messaging/send')

  const rows = await db
    .select({
      id: leads.id,
      leadStatus: leads.leadStatus,
      statusReason: leads.statusReason,
      currentPhase: leads.currentPhase,
      d3IsShopper: leads.d3IsShopper,
      surveyQuestionIndex: leads.surveyQuestionIndex,
      phoneNumber: leads.phoneNumber,
      channelUserId: leads.channelUserId,
      fullName: surveyProfiles.fullName,
      createdAt: leads.createdAt,
      lastActivityAt: leads.lastActivityAt,
    })
    .from(leads)
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(like(leads.channelUserId, '__.%'))

  const bsuidLeads = (rows as LeadRow[]).filter((r) => BSUID_PATTERN.test(r.channelUserId))

  const categoryA = bsuidLeads.filter(
    (r) =>
      r.leadStatus === 'abandono' &&
      LINK_SENT_TIMEOUT_REASONS.has(r.statusReason ?? '') &&
      !r.phoneNumber,
  )

  const categoryB = bsuidLeads.filter(
    (r) => r.leadStatus === 'incomplete' && r.d3IsShopper === true && r.surveyQuestionIndex > 0 && !r.phoneNumber,
  )

  const categoryC = bsuidLeads.filter((r) => {
    if (!r.phoneNumber) return false
    const bsuidDigits = digitsOf(r.channelUserId)
    return digitsOf(r.phoneNumber) === bsuidDigits
  })

  const handled = new Set([...categoryA, ...categoryB, ...categoryC].map((r) => r.id))
  const categoryD = bsuidLeads.filter((r) => !handled.has(r.id))

  console.log(`Found ${bsuidLeads.length} WhatsApp lead(s) with a BSUID channel_user_id.\n`)

  console.log(`Category A — stuck in abandono, no phone, survey already done (${categoryA.length}):`)
  console.log('  Auto-remediable with --send: ask for phone, retry TDM registration once provided.')
  for (const r of categoryA) {
    console.log(`  - ${r.id}  ${r.fullName ?? '(sin nombre)'}  channel_user_id=${r.channelUserId}  last_activity=${r.lastActivityAt.toISOString()}`)
  }

  console.log(`\nCategory B — mid-survey, already past the phone gate, no phone yet (${categoryB.length}):`)
  console.log('  NOT auto-remediated here — review before interrupting an in-progress chat.')
  for (const r of categoryB) {
    console.log(`  - ${r.id}  ${r.fullName ?? '(sin nombre)'}  channel_user_id=${r.channelUserId}  survey_question_index=${r.surveyQuestionIndex}  last_activity=${r.lastActivityAt.toISOString()}`)
  }

  console.log(`\nCategory C — a BSUID's digits got saved AS a phone number (wrong number, possibly sent to TDM) (${categoryC.length}):`)
  console.log('  NOT auto-remediated here — needs a human check of what TDM actually did with it.')
  for (const r of categoryC) {
    console.log(`  - ${r.id}  ${r.fullName ?? '(sin nombre)'}  channel_user_id=${r.channelUserId}  phone_number=${r.phoneNumber}  lead_status=${r.leadStatus}/${r.statusReason}`)
  }

  console.log(`\nCategory D — BSUID id, but not yet at the phone gate or otherwise not stuck (${categoryD.length}, no action needed — self-heals with the code fix):`)
  for (const r of categoryD) {
    console.log(`  - ${r.id}  lead_status=${r.leadStatus}/${r.statusReason ?? ''}  phase=${r.currentPhase}`)
  }

  if (!send) {
    console.log('\nDry run only — no messages sent, no rows changed. Re-run with --send to remediate Category A.')
    return
  }

  if (categoryA.length === 0) {
    console.log('\n--send passed, but there is nothing in Category A to remediate.')
    return
  }

  console.log(`\n--send passed — messaging and marking ${categoryA.length} Category A lead(s)...`)
  const prompt =
    'Hola 👋 Notamos un problema técnico al procesar tu registro: nos falta tu número de teléfono. ' +
    '¿Nos lo compartes con código de país? (ej. +18095551234)'

  for (const r of categoryA) {
    const recipient: ChannelRecipient & { id: string } = {
      id: r.id,
      channel: 'whatsapp',
      channelUserId: r.channelUserId,
    }
    try {
      await sendText(recipient, prompt)
      await markLeadForPhoneRemediation(r.id)
      console.log(`  ✅ ${r.id} — messaged and marked`)
    } catch (err) {
      console.error(`  ❌ ${r.id} — failed:`, err)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
