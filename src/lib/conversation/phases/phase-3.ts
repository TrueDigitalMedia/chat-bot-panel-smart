import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { env } from '@/lib/env'
import { supportRedirect } from '../exit-messages'
import type { Lead } from '@/types/lead'

export async function handlePhase3Success(lead: Lead, correlationId: string): Promise<void> {
  await db.update(leads).set({ currentPhase: 3, updatedAt: new Date() }).where(eq(leads.id, lead.id))
  // Trigger Phase 4
  const { handlePhase4 } = await import('./phase-4')
  await handlePhase4(lead, correlationId)
}

export async function handlePhase3Failure(lead: Lead): Promise<void> {
  await sendText(
    lead,
    `${supportRedirect(env.SUPPORT_CONTACT)}\n\nHubo un error al completar tu registro (mock). Nuestro equipo te ayudará a resolverlo.`,
  )
}
