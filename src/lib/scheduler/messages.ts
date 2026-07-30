import { db } from '@/lib/db/client'
import { messageVariants, leadMessageVariantUsage } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export function getReEngagementMessage(attemptNumber: 1 | 2 | 3): string {
  const messages: Record<1 | 2 | 3, string> = {
    1: '👋 ¡Hola! Notamos que te quedaste a mitad del proceso de inscripción a PanelSmart. ¿Te gustaría continuar y ganar premios por compartir tus compras? 🎁',
    2: '💚 Todavía tienes tiempo de unirte a PanelSmart. Miles de personas ya ganan premios por hacer lo que ya hacen: ¡comprar! No pierdas tu cupo 🚀',
    3: '⏰ Este es nuestro último aviso. Tu cupo en PanelSmart podría ser asignado a otra persona pronto. ¡Completa tu inscripción ahora y empieza a ganar premios! 🎉',
  }
  return messages[attemptNumber]
}

/**
 * Get next message variant for a lead, rotating sequentially (A→B→C→A).
 * Prevents sending the same variant within 24h to avoid WhatsApp spam filters.
 */
export async function getNextMessageVariant(
  leadId: string,
  attemptNumber: 1 | 2 | 3,
): Promise<string> {
  // Fetch all variants for this attempt
  const variants = await db
    .select()
    .from(messageVariants)
    .where(eq(messageVariants.attemptNumber, attemptNumber))
    .orderBy(messageVariants.variantOrder)

  if (!variants.length) {
    // Fallback to original message if no variants seeded yet
    return getReEngagementMessage(attemptNumber)
  }

  // Get last variant used for this lead & attempt
  const [lastUsage] = await db
    .select()
    .from(leadMessageVariantUsage)
    .where(and(
      eq(leadMessageVariantUsage.leadId, leadId),
      eq(leadMessageVariantUsage.attemptNumber, attemptNumber),
    ))

  // Determine next variant order (circular: 1→2, 2→3, 3→1)
  let nextVariantOrder = 1
  if (lastUsage) {
    const nextOrder = lastUsage.variantOrder % variants.length + 1
    nextVariantOrder = nextOrder
  }

  const selectedVariant = variants.find((v) => v.variantOrder === nextVariantOrder) || variants[0]

  // Record usage for this lead: delete old and insert new, or just insert if new
  if (lastUsage) {
    await db
      .update(leadMessageVariantUsage)
      .set({
        variantOrder: selectedVariant.variantOrder,
        sentAt: new Date(),
      })
      .where(and(
        eq(leadMessageVariantUsage.leadId, leadId),
        eq(leadMessageVariantUsage.attemptNumber, attemptNumber),
      ))
  } else {
    await db.insert(leadMessageVariantUsage).values({
      leadId,
      attemptNumber,
      variantOrder: selectedVariant.variantOrder,
      sentAt: new Date(),
    })
  }

  return selectedVariant.templateText
}
