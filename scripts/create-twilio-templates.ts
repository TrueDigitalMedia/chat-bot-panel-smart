/**
 * Creates the 29 approved-template candidates (scripts/twilio-templates.config.ts) as
 * Twilio Content resources and submits each for WhatsApp approval — idempotent: a
 * logicalId that already has a row in whatsapp_templates is skipped, so re-running
 * this never creates duplicates (unlike the old in-memory-cache bug that flooded the
 * account with 425 duplicate Content resources).
 *
 * Usage:
 *   npx tsx scripts/create-twilio-templates.ts                 # all 29
 *   npx tsx scripts/create-twilio-templates.ts phase1_reengage_a1_v1   # one, for a test run first
 */
import { eq, and } from 'drizzle-orm'
import { TEMPLATES, type TemplateConfig } from './twilio-templates.config'

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

  const only = process.argv[2]
  const templates = only ? TEMPLATES.filter((t) => t.logicalId === only) : TEMPLATES
  if (only && templates.length === 0) {
    console.error(`No template found with logicalId "${only}"`)
    process.exit(1)
  }

  console.log(`Processing ${templates.length} template(s)...`)

  for (const tpl of templates) {
    const [existing] = await db
      .select({ id: whatsappTemplates.id, contentSid: whatsappTemplates.contentSid, approvalStatus: whatsappTemplates.approvalStatus })
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.logicalId, tpl.logicalId), eq(whatsappTemplates.provider, 'twilio')))

    if (existing?.contentSid && existing.approvalStatus !== 'rejected') {
      console.log(`⏭  ${tpl.logicalId} — already exists (${existing.contentSid}, ${existing.approvalStatus}), skipping`)
      continue
    }
    if (existing?.approvalStatus === 'rejected') {
      // Twilio Content resources are immutable — a rejected one can't be edited and
      // resubmitted, so a retry needs a fresh Content resource (the old, dead one is
      // left orphaned in Twilio, same as any rejected template would be).
      console.log(`🔁 ${tpl.logicalId} — previous attempt was rejected, retrying with fresh content`)
    }

    try {
      const contentSid = await createContent(tpl, auth)
      console.log(`✅ ${tpl.logicalId} — created content ${contentSid}`)

      await submitApproval(contentSid, tpl, auth)
      console.log(`📨 ${tpl.logicalId} — approval request submitted`)

      if (existing) {
        await db
          .update(whatsappTemplates)
          .set({ contentSid, approvalStatus: 'pending', updatedAt: new Date() })
          .where(eq(whatsappTemplates.id, existing.id))
      } else {
        await db.insert(whatsappTemplates).values({
          logicalId: tpl.logicalId,
          provider: 'twilio',
          contentSid,
          language: 'es',
          approvalStatus: 'pending',
        })
      }
      console.log(`💾 ${tpl.logicalId} — saved to whatsapp_templates (pending)`)
    } catch (err) {
      console.error(`❌ ${tpl.logicalId} — failed:`, err instanceof Error ? err.message : err)
    }
  }

  console.log('\nDone. Run scripts/sync-twilio-template-approvals.ts later to pick up Meta\'s review results.')
}

async function createContent(tpl: TemplateConfig, auth: string): Promise<string> {
  const types: Record<string, unknown> = tpl.authentication
    ? {
        'whatsapp/authentication': {
          add_security_recommendation: tpl.authentication.addSecurityRecommendation ?? true,
          code_expiration_minutes: tpl.authentication.codeExpirationMinutes,
          actions: [{ type: 'COPY_CODE', copy_code_text: 'Copiar código' }],
        },
      }
    : tpl.buttons?.length
      ? {
          'twilio/quick-reply': {
            body: tpl.body,
            actions: tpl.buttons.map((b) => ({ title: b.title, id: b.id })),
          },
        }
      : { 'twilio/text': { body: tpl.body } }

  const variables = tpl.variables?.length
    ? Object.fromEntries(tpl.variables.map((v) => [v, 'sample']))
    : undefined

  const res = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      friendly_name: tpl.logicalId,
      language: 'es',
      variables,
      types,
    }),
  })
  const data = (await res.json()) as { sid?: string; message?: string }
  if (!res.ok || !data.sid) {
    throw new Error(`Content API error: ${res.status} ${data.message ?? JSON.stringify(data)}`)
  }
  return data.sid
}

async function submitApproval(contentSid: string, tpl: TemplateConfig, auth: string): Promise<void> {
  const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: tpl.logicalId, category: tpl.category }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`ApprovalRequest error: ${res.status} ${JSON.stringify(data)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
