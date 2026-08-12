// Exact exit messages from the verified PanelSmart demo

export const EXIT_A =
  'Lo sentimos 💙\nNo te preocupes que tus datos están seguros 🔒 y, si no aplicas esta vez, no te preocupes: no los usaremos ni guardaremos.\nGracias por tu interés\n💬 Si necesitas ayuda, escríbenos y nuestro equipo de atención al cliente te apoyará.\nPuedes seguir nuestras redes sociales:\nhttps://www.facebook.com/PanelSmartLatino\nhttps://www.instagram.com/panelsmart_latino/'

export const EXIT_B =
  '😔 Lo sentimos, por ahora el cupo de panelistas en tu zona ya está completo. Agradecemos tu interés en participar.\n✨ Más adelante podría abrirse un espacio, así que mantente atent@ 💚.\n🔒 No te preocupes por la información que compartiste: al no participar, no la usaremos ni la guardaremos.\nPuedes seguir nuestras redes sociales y esperamos tener nuevas convocatorias muy pronto:\nhttps://www.facebook.com/PanelSmartLatino\nhttps://www.instagram.com/panelsmart_latino/'

export const EXIT_B_THANKS = '🎉 ¡Gracias por tus respuestas!'

export const IOS_APP_LINK = 'https://apps.apple.com/us/app/panelsmart/id900007535?l=es'
export const ANDROID_APP_LINK = 'https://play.google.com/store/apps/details?id=com.lumi.kwpsmartpanel&hl=es_US&gl=US'

export function supportRedirect(): string {
  return `Gracias por tu interés. Nuestro equipo se pondrá en contacto contigo para ayudarte a resolver tus dudas.\n\nMientras tanto, aquí estaré si quieres retomar tu inscripción.`
}

export const AGENT_HANDOFF_EMAIL = 'jaqueline.olicon@wp.numerator.com'

export const PHASE2_AGENT_INTRO =
  `Antes de seguir: si en cualquier momento necesitás ayuda con la app o tenés alguna duda, escribime "agente" y te derivo con nuestro equipo.\n📲 ${AGENT_HANDOFF_EMAIL}`

export function agentHandoffReply(): string {
  return `Te comunico con nuestro equipo 📲. Podés escribirles directamente a ${AGENT_HANDOFF_EMAIL} y con gusto te van a ayudar.`
}

/** Sent right before an abandono caused by our own inability to request/deliver the
 *  registration code (TDM not configured, missing survey profile) — without this the
 *  user gets no signal at all that anything happened before the generic support
 *  redirect starts repeating on every subsequent message. Framed as a delay, not a
 *  failure — the user did nothing wrong and this isn't visibly an error on our end. */
export function registrationCodeDelayedRedirect(): string {
  return `Tu código de registro está tardando más de lo esperado en llegar. No te preocupes, nuestro equipo se pondrá en contacto contigo para ayudarte a completar tu registro.`
}
