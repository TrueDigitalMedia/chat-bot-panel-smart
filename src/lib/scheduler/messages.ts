import { db } from '@/lib/db/client'
import { messageVariants, leadMessageVariantUsage } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { IOS_APP_LINK, ANDROID_APP_LINK } from '@/lib/conversation/exit-messages'
import type { LeadStatus } from '@/types/lead'

/**
 * Which recontact context a message belongs to — each pool rotates its own set of
 * variants independently, keyed by attemptNumber, so phase 1/2/4 never share (or
 * collide on) rotation state despite all using the same 1-3 attempt numbering.
 */
export const MESSAGE_POOLS = ['phase1_reengage', 'phase2_link_reminder', 'phase4_ficha_hogar'] as const
export type MessagePool = (typeof MESSAGE_POOLS)[number]

/** Picks the message pool for the lead's current status at send time. */
export function resolveMessagePool(leadStatus: LeadStatus): MessagePool {
  if (leadStatus === 'link_sent') return 'phase2_link_reminder'
  if (leadStatus === 'code_delivered_registered') return 'phase4_ficha_hogar'
  return 'phase1_reengage'
}

/**
 * Fallback copy used when no DB variants are seeded yet for a given pool. Only attempts
 * 1-3 have hardcoded copy; a higher attempt number (if MAX_REENGAGEMENT_ATTEMPTS is ever
 * raised past 3 without adding entries here) clamps to the attempt-3 "last call" message.
 */
export function getFallbackMessage(pool: MessagePool, attemptNumber: number): string {
  const key = Math.min(Math.max(attemptNumber, 1), 3) as 1 | 2 | 3
  const messages: Record<MessagePool, Record<1 | 2 | 3, string>> = {
    phase1_reengage: {
      1: '👋 ¡Hola! Notamos que te quedaste a mitad del proceso de inscripción a PanelSmart. ¿Te gustaría continuar y ganar premios por compartir tus compras? 🎁',
      2: '💚 Todavía tienes tiempo de unirte a PanelSmart. Miles de personas ya ganan premios por hacer lo que ya hacen: ¡comprar! No pierdas tu cupo 🚀',
      3: '⏰ Este es nuestro último aviso. Tu cupo en PanelSmart podría ser asignado a otra persona pronto. ¡Completa tu inscripción ahora y empieza a ganar premios! 🎉',
    },
    phase2_link_reminder: {
      1: `📲 ¿Ya descargaste la app de PanelSmart? En cuanto la tengas, te enviamos tu código de registro al toque.\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
      2: `⏳ Sigue pendiente descargar la app de PanelSmart para recibir tu código de registro. No tardes mucho 👇\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
      3: `⏰ Última oportunidad: tu cupo en PanelSmart podría asignarse a otra persona si no descargas la app pronto.\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
    },
    phase4_ficha_hogar: {
      1: '🏡 ¡Ya casi terminas! Solo faltan unas preguntas de tu Ficha Hogar para completar tu perfil en PanelSmart.',
      2: '💚 Tu Ficha Hogar sigue incompleta — termínala en un par de minutos y no te pierdas tus premios.',
      3: '⏰ Último aviso: completa tu Ficha Hogar pronto o podrías perder tu lugar en el panel.',
    },
  }
  return messages[pool][key]
}

/**
 * Get next message variant for a lead within a given pool, rotating sequentially
 * (A→B→C→A). Prevents sending the same variant within 24h to avoid WhatsApp spam
 * filters. Pools rotate independently — the same (leadId, attemptNumber) pair in two
 * different pools tracks separate rotation state.
 */
export interface MessageVariantResult {
  text: string
  variantOrder: number
}

export async function getNextMessageVariant(
  leadId: string,
  attemptNumber: number,
  pool: MessagePool,
): Promise<MessageVariantResult> {
  // Fetch all variants for this pool+attempt
  const variants = await db
    .select()
    .from(messageVariants)
    .where(and(eq(messageVariants.pool, pool), eq(messageVariants.attemptNumber, attemptNumber)))
    .orderBy(messageVariants.variantOrder)

  if (!variants.length) {
    // Fallback to the hardcoded message if no variants seeded yet for this pool.
    // variantOrder is a stand-in (there's no real row to draw it from) — its only use
    // downstream is building a template logicalId, and a template registered for a
    // pool with no seeded variants simply won't match, which is the correct fallback.
    return { text: getFallbackMessage(pool, attemptNumber), variantOrder: attemptNumber }
  }

  // Get last variant used for this lead & pool & attempt
  const [lastUsage] = await db
    .select()
    .from(leadMessageVariantUsage)
    .where(and(
      eq(leadMessageVariantUsage.leadId, leadId),
      eq(leadMessageVariantUsage.pool, pool),
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
        eq(leadMessageVariantUsage.pool, pool),
        eq(leadMessageVariantUsage.attemptNumber, attemptNumber),
      ))
  } else {
    await db.insert(leadMessageVariantUsage).values({
      leadId,
      pool,
      attemptNumber,
      variantOrder: selectedVariant.variantOrder,
      sentAt: new Date(),
    })
  }

  return { text: selectedVariant.templateText, variantOrder: selectedVariant.variantOrder }
}
