import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'
import { sendText } from '@/lib/messaging/send'
import { supportRedirect } from '../exit-messages'
import type { Lead } from '@/types/lead'

export async function handlePhase3Success(lead: Lead, correlationId: string): Promise<void> {
  await db.update(leads).set({ currentPhase: 3, updatedAt: new Date() }).where(eq(leads.id, lead.id))
  // Enter Fase 4 — Ficha Hogar interactive questionnaire (sends question 1)
  const { handleFichaHogar } = await import('./phase-4')
  await handleFichaHogar(lead, '', undefined, correlationId)
}

export async function handlePhase3Failure(lead: Lead): Promise<void> {
  await sendText(
    lead,
    `${supportRedirect()}\n\nHubo un error al completar tu registro (mock). Nuestro equipo te ayudará a resolverlo.`,
  )
}
