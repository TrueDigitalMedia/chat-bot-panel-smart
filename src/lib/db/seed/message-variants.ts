import { db } from '@/lib/db/client'
import { messageVariants } from '@/lib/db/schema'

const VARIANTS = [
  // Attempt 1 (75 minutes)
  {
    attemptNumber: 1 as const,
    variantOrder: 1,
    templateText: '👋 Hola, notamos que dejaste la inscripción a mitad de camino. ¿Te ayudamos a completarla? Los datos ya están guardados 💾',
  },
  {
    attemptNumber: 1 as const,
    variantOrder: 2,
    templateText: '✨ ¿Dónde andabas? Te extrañamos 😊 Completa tu registro en PanelSmart y empieza a ganar 🎁',
  },
  {
    attemptNumber: 1 as const,
    variantOrder: 3,
    templateText: '📱 Casi lo logras! Solo falta terminar tu perfil para acceder a premios exclusivos. ¿Continuamos? ⚡',
  },

  // Attempt 2 (7 hours)
  {
    attemptNumber: 2 as const,
    variantOrder: 1,
    templateText: '💚 Todavía tienes tiempo de unirte a PanelSmart. Miles ganan premios compartiendo sus compras 🛍️ Completa ahora 👉',
  },
  {
    attemptNumber: 2 as const,
    variantOrder: 2,
    templateText: '🎯 Última llamada: Tu registro está al 80%. Solo toma 2 minutos finalizarlo y acceder a recompensas 💰',
  },
  {
    attemptNumber: 2 as const,
    variantOrder: 3,
    templateText: '🚀 Aún hay cupo para ti en PanelSmart! Termina tu perfil hoy y comienza a canjear puntos 🏆',
  },

  // Attempt 3 (12 hours)
  {
    attemptNumber: 3 as const,
    variantOrder: 1,
    templateText: '⏰ Última oportunidad: Tu cupo en PanelSmart expira pronto. ¡Completa ahora! No te arrepentirás 💪',
  },
  {
    attemptNumber: 3 as const,
    variantOrder: 2,
    templateText: '🔔 Recordatorio: Tu acceso a premios exclusivos vence en horas. Termina tu inscripción ya 👇',
  },
  {
    attemptNumber: 3 as const,
    variantOrder: 3,
    templateText: '⚡ ¿Lo dejamos? Tu lugar en PanelSmart se está cerrando. Completa ahora y empieza a ganar 🎉',
  },
]

export async function seedMessageVariants(): Promise<void> {
  console.log('Seeding message variants...')

  // Check if variants already exist
  const existingCount = await db.select().from(messageVariants)
  if (existingCount.length > 0) {
    console.log(`✓ Message variants already seeded (${existingCount.length} found)`)
    return
  }

  // Insert all variants
  await db.insert(messageVariants).values(VARIANTS)

  console.log(`✓ Seeded ${VARIANTS.length} message variants`)
}

// Execute seed on module load
seedMessageVariants().catch((err) => {
  console.error('Error seeding message variants:', err)
})
