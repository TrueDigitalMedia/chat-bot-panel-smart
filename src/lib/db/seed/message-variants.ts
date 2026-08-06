import { db } from '@/lib/db/client'
import { messageVariants } from '@/lib/db/schema'
import { MESSAGE_POOLS, type MessagePool } from '@/lib/scheduler/messages'
import { IOS_APP_LINK, ANDROID_APP_LINK } from '@/lib/conversation/exit-messages'

const VARIANTS = [
  // Attempt 1 (75 minutes)
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 1 as const,
    variantOrder: 1,
    templateText: '👋 Hola, notamos que dejaste la inscripción a mitad de camino. ¿Te ayudamos a completarla? Los datos ya están guardados 💾',
  },
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 1 as const,
    variantOrder: 2,
    templateText: '✨ ¿Dónde andabas? Te extrañamos 😊 Completa tu registro en PanelSmart y empieza a ganar 🎁',
  },
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 1 as const,
    variantOrder: 3,
    templateText: '📱 Casi lo logras! Solo falta terminar tu perfil para acceder a premios exclusivos. ¿Continuamos? ⚡',
  },

  // Attempt 2 (7 hours)
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 2 as const,
    variantOrder: 1,
    templateText: '💚 Todavía tienes tiempo de unirte a PanelSmart. Miles ganan premios compartiendo sus compras 🛍️ Completa ahora 👉',
  },
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 2 as const,
    variantOrder: 2,
    templateText: '🎯 Última llamada: Tu registro está al 80%. Solo toma 2 minutos finalizarlo y acceder a recompensas 💰',
  },
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 2 as const,
    variantOrder: 3,
    templateText: '🚀 Aún hay cupo para ti en PanelSmart! Termina tu perfil hoy y comienza a canjear puntos 🏆',
  },

  // Attempt 3 (12 hours)
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 3 as const,
    variantOrder: 1,
    templateText: '⏰ Última oportunidad: Tu cupo en PanelSmart expira pronto. ¡Completa ahora! No te arrepentirás 💪',
  },
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 3 as const,
    variantOrder: 2,
    templateText: '🔔 Recordatorio: Tu acceso a premios exclusivos vence en horas. Termina tu inscripción ya 👇',
  },
  {
    pool: 'phase1_reengage' as const,
    attemptNumber: 3 as const,
    variantOrder: 3,
    templateText: '⚡ ¿Lo dejamos? Tu lugar en PanelSmart se está cerrando. Completa ahora y empieza a ganar 🎉',
  },

  // --- phase2_link_reminder: lead is `link_sent`, hasn't downloaded the app yet ---
  // Attempt 1 (75 minutes)
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 1 as const,
    variantOrder: 1,
    templateText: `📲 ¿Ya descargaste la app de PanelSmart? En cuanto la tengas, te enviamos tu código de registro al toque.\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 1 as const,
    variantOrder: 2,
    templateText: `🎁 Estás a un paso de empezar a ganar premios — solo falta descargar la app. ¿Te ayudamos?\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 1 as const,
    variantOrder: 3,
    templateText: `✨ Tu cupo en PanelSmart ya está confirmado, solo falta la app para activarlo 🚀\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },

  // Attempt 2 (7 hours)
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 2 as const,
    variantOrder: 1,
    templateText: `⏳ Sigue pendiente descargar la app de PanelSmart para recibir tu código de registro. No tardes mucho 👇\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 2 as const,
    variantOrder: 2,
    templateText: `💚 Miles de personas ya están ganando premios en PanelSmart compartiendo sus compras. Descarga la app y súmate 🛍️\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 2 as const,
    variantOrder: 3,
    templateText: `🔔 Recordatorio: tu código de registro te espera. Descarga la app cuando puedas y te lo enviamos al instante ⚡\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },

  // Attempt 3 (12 hours)
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 3 as const,
    variantOrder: 1,
    templateText: `⏰ Última oportunidad: tu cupo en PanelSmart podría asignarse a otra persona si no descargas la app pronto.\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 3 as const,
    variantOrder: 2,
    templateText: `⚡ ¿Lo dejamos aquí? Descarga la app ahora y no pierdas tu lugar en PanelSmart.\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },
  {
    pool: 'phase2_link_reminder' as const,
    attemptNumber: 3 as const,
    variantOrder: 3,
    templateText: `🚨 Este es nuestro último aviso: descarga la app para activar tu cupo antes de que se cierre.\n\n📱 iOS: ${IOS_APP_LINK}\n🤖 Android: ${ANDROID_APP_LINK}`,
  },

  // --- phase4_ficha_hogar: lead is `code_delivered_registered`, hasn't finished the Ficha Hogar questionnaire ---
  // Attempt 1 (75 minutes)
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 1 as const,
    variantOrder: 1,
    templateText: '🏡 ¡Ya casi terminas! Solo faltan unas preguntas de tu Ficha Hogar para completar tu perfil en PanelSmart.',
  },
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 1 as const,
    variantOrder: 2,
    templateText: '📋 Notamos que dejaste tu Ficha Hogar a mitad de camino. ¿Seguimos? Son solo un par de preguntas más.',
  },
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 1 as const,
    variantOrder: 3,
    templateText: '✨ Un último paso para tu Ficha Hogar y quedas listo para empezar a ganar premios en PanelSmart 🎁',
  },

  // Attempt 2 (7 hours)
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 2 as const,
    variantOrder: 1,
    templateText: '💚 Tu Ficha Hogar sigue incompleta — termínala en un par de minutos y no te pierdas tus premios.',
  },
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 2 as const,
    variantOrder: 2,
    templateText: '🎯 Estás muy cerca: solo faltan algunas preguntas de tu Ficha Hogar para activar tu cupo por completo.',
  },
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 2 as const,
    variantOrder: 3,
    templateText: '🚀 Completa tu Ficha Hogar hoy y empieza a disfrutar de todos los beneficios de PanelSmart.',
  },

  // Attempt 3 (12 hours)
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 3 as const,
    variantOrder: 1,
    templateText: '⏰ Último aviso: completa tu Ficha Hogar pronto o podrías perder tu lugar en el panel.',
  },
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 3 as const,
    variantOrder: 2,
    templateText: '🔔 Recordatorio final: tu Ficha Hogar quedó a medias. Termínala ahora para no perder tu cupo.',
  },
  {
    pool: 'phase4_ficha_hogar' as const,
    attemptNumber: 3 as const,
    variantOrder: 3,
    templateText: '⚡ ¿Seguimos? Tu Ficha Hogar está casi lista — solo falta este último paso.',
  },
]

export async function seedMessageVariants(): Promise<void> {
  console.log('Seeding message variants...')

  // Per-pool guard (not all-or-nothing) — so re-running this after a new pool is added
  // tops up just the missing pool(s) without touching ones already seeded in production.
  const existingPools = new Set(
    (await db.selectDistinct({ pool: messageVariants.pool }).from(messageVariants)).map((r) => r.pool),
  )
  const missingPools = MESSAGE_POOLS.filter((pool) => !existingPools.has(pool))
  const poolsWithVariants = new Set<MessagePool>(VARIANTS.map((v) => v.pool))
  const toInsert = VARIANTS.filter((v) => missingPools.includes(v.pool))

  if (!toInsert.length) {
    console.log(`✓ Message variants already seeded for all pools with defined variants (${[...poolsWithVariants].join(', ')})`)
    return
  }

  await db.insert(messageVariants).values(toInsert)

  console.log(`✓ Seeded ${toInsert.length} message variants for pool(s): ${missingPools.filter((p) => poolsWithVariants.has(p)).join(', ')}`)
}

// Execute seed on module load
seedMessageVariants().catch((err) => {
  console.error('Error seeding message variants:', err)
})
