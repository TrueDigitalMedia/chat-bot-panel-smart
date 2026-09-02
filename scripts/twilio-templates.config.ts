/**
 * Source of truth for the 29 WhatsApp templates that need Meta approval — the messages
 * genuinely business-initiated (a cron job or an external webhook, not a reply to a
 * fresh inbound message). Body text here is already corrected: no false urgency/
 * scarcity language ("última oportunidad", "expira pronto", the 🚨 emoji), and
 * "premio(s)" (lottery/sweepstakes-adjacent in LatAm Spanish) swapped for
 * "recompensa(s)" (reads as compensation for an action) where it appeared.
 *
 * `logicalId` must match reengageTemplateLogicalId()/the fixed constants in
 * src/lib/whatsapp/providers/twilio/template-ids.ts exactly — it's both the Twilio
 * Content friendly_name/ApprovalRequest name and the whatsapp_templates.logical_id
 * lookup key at send time.
 */

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export interface TemplateButton {
  title: string
  id: string
}

export interface AuthenticationConfig {
  addSecurityRecommendation?: boolean
  codeExpirationMinutes?: number
}

export interface TemplateConfig {
  logicalId: string
  category: TemplateCategory
  /** Not used for AUTHENTICATION — WhatsApp presets that body, no custom text allowed. */
  body?: string
  buttons?: TemplateButton[]
  /** Twilio Content variable numbers this body references, e.g. ['1'] for {{1}}. */
  variables?: string[]
  /** Present only for category 'AUTHENTICATION' — selects the whatsapp/authentication content type. */
  authentication?: AuthenticationConfig
}

// Meta rejects quick-reply buttons that contain emojis, newlines, variables, or other
// formatting — confirmed by a real rejection (subCode 2388060) on the first test
// submission. Button titles here must stay plain text; emojis are fine in the body.
const REENGAGE_BUTTONS: TemplateButton[] = [
  { title: 'Continuar', id: 'reengage:continue' },
  { title: 'No, gracias', id: 'reengage:stop' },
]

const APP_LINKS =
  '\n\n📱 iOS: https://apps.apple.com/us/app/panelsmart/id900007535?l=es\n🤖 Android: https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US'

export const TEMPLATES: TemplateConfig[] = [
  // --- phase1_reengage ---
  {
    logicalId: 'phase1_reengage_a1_v1',
    category: 'MARKETING',
    body: '👋 Hola, notamos que dejaste la inscripción a mitad de camino. ¿Te ayudamos a completarla? Los datos ya están guardados 💾',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a1_v2',
    category: 'MARKETING',
    body: '✨ ¿Dónde andabas? Te extrañamos 😊 Completa tu registro en PanelSmart y empieza a ganar 🎁',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a1_v3',
    category: 'MARKETING',
    body: '📱 Casi lo logras! Solo falta terminar tu perfil para acceder a recompensas exclusivas ⚡',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a2_v1',
    category: 'MARKETING',
    body: '💚 Todavía tienes tiempo de unirte a PanelSmart. Miles ganan recompensas compartiendo sus compras 🛍️ Completa ahora 👉',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a2_v2',
    category: 'MARKETING',
    body: '🎯 Ya casi terminas tu registro en PanelSmart. Solo toma 2 minutos finalizarlo y acceder a recompensas 💰',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a2_v3',
    category: 'MARKETING',
    body: '🚀 Aún hay cupo para ti en PanelSmart! Termina tu perfil hoy y comienza a canjear puntos 🏆',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a3_v1',
    category: 'MARKETING',
    body: '⏰ Recordatorio: tu inscripción a PanelSmart sigue disponible. ¡Complétala ahora! 💪',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a3_v2',
    category: 'MARKETING',
    body: '🔔 Recordatorio: tu acceso a recompensas de PanelSmart sigue abierto. Termina tu inscripción 👇',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase1_reengage_a3_v3',
    category: 'MARKETING',
    body: '⚡ ¿Lo dejamos? Puedes retomar tu registro en PanelSmart cuando quieras y empezar a ganar 🎉',
    buttons: REENGAGE_BUTTONS,
  },

  // --- phase2_link_reminder ---
  {
    logicalId: 'phase2_link_reminder_a1_v1',
    category: 'MARKETING',
    body: `📲 ¿Ya descargaste la app de PanelSmart? En cuanto la tengas, te enviamos tu código de registro al toque.${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a1_v2',
    category: 'MARKETING',
    body: `🎁 Estás a un paso de empezar a ganar recompensas — solo falta descargar la app. ¿Te ayudamos?${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a1_v3',
    category: 'MARKETING',
    body: `✨ Tu cupo en PanelSmart ya está confirmado, solo falta la app para activarlo 🚀${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a2_v1',
    category: 'MARKETING',
    body: `⏳ Sigue pendiente descargar la app de PanelSmart para recibir tu código de registro. No tardes mucho 👇${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a2_v2',
    category: 'MARKETING',
    body: `💚 Miles de personas ya están ganando recompensas en PanelSmart compartiendo sus compras. Descarga la app y súmate 🛍️${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a2_v3',
    category: 'MARKETING',
    body: `🔔 Recordatorio: tu código de registro te espera. Descarga la app cuando puedas y te lo enviamos al instante ⚡${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a3_v1',
    category: 'MARKETING',
    body: `⏰ Recordatorio final: descarga la app de PanelSmart para recibir tu código de registro.${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a3_v2',
    category: 'MARKETING',
    body: `⚡ ¿Lo dejamos aquí? Descarga la app cuando quieras para continuar en PanelSmart.${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase2_link_reminder_a3_v3',
    category: 'MARKETING',
    body: `📲 Último recordatorio: descarga la app para activar tu registro en PanelSmart.${APP_LINKS}`,
    buttons: REENGAGE_BUTTONS,
  },

  // --- phase4_ficha_hogar ---
  {
    logicalId: 'phase4_ficha_hogar_a1_v1',
    category: 'MARKETING',
    body: '🏡 ¡Ya casi terminas! Solo faltan unas preguntas de tu Ficha Hogar para completar tu perfil en PanelSmart.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a1_v2',
    category: 'MARKETING',
    body: '📋 Notamos que dejaste tu Ficha Hogar a mitad de camino. ¿Seguimos? Son solo un par de preguntas más.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a1_v3',
    category: 'MARKETING',
    body: '✨ Un último paso para tu Ficha Hogar y quedas listo para empezar a ganar recompensas en PanelSmart 🎁',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a2_v1',
    category: 'MARKETING',
    body: '💚 Tu Ficha Hogar sigue incompleta — termínala en un par de minutos y no te pierdas tus recompensas.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a2_v2',
    category: 'MARKETING',
    body: '🎯 Estás muy cerca: solo faltan algunas preguntas de tu Ficha Hogar para activar tu cupo por completo.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a2_v3',
    category: 'MARKETING',
    body: '🚀 Completa tu Ficha Hogar hoy y empieza a disfrutar de todos los beneficios de PanelSmart.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a3_v1',
    category: 'MARKETING',
    body: '⏰ Último recordatorio: completa tu Ficha Hogar para terminar tu registro en el panel.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a3_v2',
    category: 'MARKETING',
    body: '🔔 Recordatorio final: tu Ficha Hogar quedó a medias. Termínala cuando puedas.',
    buttons: REENGAGE_BUTTONS,
  },
  {
    logicalId: 'phase4_ficha_hogar_a3_v3',
    category: 'MARKETING',
    body: '⚡ ¿Seguimos? Tu Ficha Hogar está casi lista — solo falta este último paso.',
    buttons: REENGAGE_BUTTONS,
  },

  // --- registration (3) ---
  // Split from a single template after Meta auto-rejected it twice: an OTP-shaped
  // variable mixed with password-reset/verification instructions matches their
  // phishing-pattern detection unless it's actually submitted as AUTHENTICATION.
  // AUTHENTICATION templates have a WhatsApp-preset body (no custom text) and only a
  // built-in "copy code" action — the instructions + confirm buttons move to their own
  // Utility template, sent as a second message right after.
  {
    logicalId: 'registration_code_otp',
    category: 'AUTHENTICATION',
    variables: ['1'],
    authentication: { addSecurityRecommendation: true, codeExpirationMinutes: 30 },
  },
  {
    logicalId: 'registration_instructions_confirm',
    category: 'UTILITY',
    // Must stay byte-identical to ONBOARDING_INSTRUCTIONS_TEXT in
    // src/lib/onboarding/deliver-registration-code.ts (that string is the fallback for
    // non-template channels). The code goes out as its own message just before this one,
    // hence "en el mensaje anterior ☝️". The walkthrough video is linked inline here
    // instead of a separate native video send.
    body:
      '📋 Pasos para registrarte en la app (tu código de registro está en el mensaje anterior ☝️):\n\n' +
      '🎬 Video con los pasos: https://uuv37gxxh4odldus.public.blob.vercel-storage.com/iniciar_sesion_ps.mp4\n\n' +
      '1️⃣ Abre la app e ingresa a «¿Ha olvidado su contraseña?».\n' +
      '2️⃣ Escribe tu código de usuario y pulsa «entregar».\n' +
      '3️⃣ Escribe los últimos 4 dígitos de tu celular (el mismo que colocaste para contactarte).\n' +
      '4️⃣ Recibirás un código por mensaje de texto a tu número de celular; escríbelo para terminar la verificación.\n\n' +
      'Si tienes cualquier duda durante el registro, escríbeme y te ayudo.\n\n' +
      'Cuando hayas “activado” la app con ese código, confirma aquí:',
    buttons: [
      { title: 'Ya me registré', id: 'register:yes' },
      { title: 'No registrado', id: 'register:no' },
    ],
  },
  {
    logicalId: 'registration_code_delayed',
    category: 'UTILITY',
    body: 'Tu código de registro está tardando más de lo esperado en llegar. No te preocupes, nuestro equipo se pondrá en contacto contigo para ayudarte a completar tu registro.',
  },
]
