/**
 * Polls Twilio for the real WhatsApp approval status of every template row that isn't
 * 'approved' yet and updates whatsapp_templates accordingly. Meant to be run by hand a
 * few times while waiting on Meta's review (minutes to ~24h) — getApprovedTemplate()
 * only starts using a row once this marks it 'approved', so the rollout stays gradual
 * without any extra flag.
 *
 * Usage: npx tsx scripts/sync-twilio-template-approvals.ts
 */
import { and, eq, ne } from 'drizzle-orm'

for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  const { db } = await import('@/lib/db/client')
  const { whatsappTemplates } = await import('@/lib/db/schema')

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in env')
    process.exit(1)
  }
  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`

  const rows = await db
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.provider, 'twilio'), ne(whatsappTemplates.approvalStatus, 'approved')))

  if (!rows.length) {
    console.log('Nothing pending — every registered template is already approved.')
    return
  }

  console.log(`Checking ${rows.length} pending template(s)...`)

  for (const row of rows) {
    if (!row.contentSid) continue
    try {
      const res = await fetch(`https://content.twilio.com/v1/Content/${row.contentSid}/ApprovalRequests`, {
        headers: { Authorization: auth },
      })
      const data = (await res.json()) as {
        whatsapp?: { status?: string; rejection_reason?: string }
      }
      const status = data.whatsapp?.status // 'received' | 'pending' | 'approved' | 'rejected'
      if (!status) {
        console.log(`⏳ ${row.logicalId} — no status yet`)
        continue
      }

      const mapped = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'
      if (mapped !== row.approvalStatus) {
        await db
          .update(whatsappTemplates)
          .set({ approvalStatus: mapped, updatedAt: new Date() })
          .where(eq(whatsappTemplates.id, row.id))
      }

      const suffix = mapped === 'rejected' && data.whatsapp?.rejection_reason ? ` (${data.whatsapp.rejection_reason})` : ''
      console.log(`${mapped === 'approved' ? '✅' : mapped === 'rejected' ? '❌' : '⏳'} ${row.logicalId} — ${mapped}${suffix}`)
    } catch (err) {
      console.error(`⚠️  ${row.logicalId} — check failed:`, err instanceof Error ? err.message : err)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
