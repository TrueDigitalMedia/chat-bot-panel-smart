import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, surveyProfiles } from '@/lib/db/schema'
import { transitionLead } from '@/lib/state-machine'
import { sendText, sendVideo } from '@/lib/messaging/send'
import { supportRedirect } from '../exit-messages'
import { env } from '@/lib/env'
import type { Lead } from '@/types/lead'
import { generateObject } from 'ai'
import { z } from 'zod'
import { boundContext } from '@/lib/ai/context-guard'
import { chatModel, CHAT_MODEL_ID } from '@/lib/ai/models'
import { logCall } from '@/lib/db/call-log'
import { generateCorrelationId } from '@/lib/correlation'
import { persistTreintaPanelist } from '@/lib/treinta/persist-panelist'

const THANK_YOU_VIDEO = process.env.THANK_YOU_VIDEO_URL ?? ''

export async function handlePhase4(lead: Lead, correlationId: string): Promise<void> {
  await db.update(leads).set({ currentPhase: 4, updatedAt: new Date() }).where(eq(leads.id, lead.id))

  // Generate AI summary of Phase 1 survey
  const [profile] = await db.select().from(surveyProfiles).where(eq(surveyProfiles.leadId, lead.id))

  const summaryCorrelationId = generateCorrelationId()
  const summaryPrompt = `Genera un resumen conciso del perfil del panelista basado en estos datos de la encuesta:\n${JSON.stringify(profile, null, 2)}`

  const context = boundContext(
    [{ role: 'user', content: summaryPrompt }],
    2000,
  )

  const model = CHAT_MODEL_ID
  const start = Date.now()
  let summary: string | null = null

  try {
    const result = await generateObject({
      model: chatModel(),
      schema: z.object({ summary: z.string().max(1000) }),
      messages: context,
    })
    summary = result.object.summary
    await logCall({
      leadId: lead.id,
      callType: 'conversation_summary',
      model,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId: summaryCorrelationId,
    }).catch(() => {})
  } catch (err) {
    await logCall({
      leadId: lead.id,
      callType: 'conversation_summary',
      model,
      latencyMs: Date.now() - start,
      correlationId: summaryCorrelationId,
      error: String(err),
    }).catch(() => {})
  }

  // Store summary
  if (summary) {
    await db.update(leads).set({ conversationSummary: summary }).where(eq(leads.id, lead.id))
  }

  // Persist Treinta-owned snapshot + embedding
  const persisted = await persistTreintaPanelist({
    leadId: lead.id,
    profile,
    summary,
    score: lead.score,
    quotaSegment: lead.quotaSegment,
  })

  if (!persisted) {
    await sendText(lead, supportRedirect(env.SUPPORT_CONTACT))
    return
  }

  await transitionLead(lead.id, 'ficha_hogar_completada', 'phase4_complete', correlationId)

  if (THANK_YOU_VIDEO) {
    await sendVideo(lead, THANK_YOU_VIDEO, '🎉 ¡Gracias por unirte a PanelSmart!')
  } else {
    await sendText(lead, '🎉 ¡Gracias por unirte a PanelSmart! Pronto recibirás más información sobre cómo ganar premios.')
  }
}
