export function getReEngagementMessage(attemptNumber: 1 | 2 | 3): string {
  const messages: Record<1 | 2 | 3, string> = {
    1: '👋 ¡Hola! Notamos que te quedaste a mitad del proceso de inscripción a PanelSmart. ¿Te gustaría continuar y ganar premios por compartir tus compras? 🎁',
    2: '💚 Todavía tienes tiempo de unirte a PanelSmart. Miles de personas ya ganan premios por hacer lo que ya hacen: ¡comprar! No pierdas tu cupo 🚀',
    3: '⏰ Este es nuestro último aviso. Tu cupo en PanelSmart podría ser asignado a otra persona pronto. ¡Completa tu inscripción ahora y empieza a ganar premios! 🎉',
  }
  return messages[attemptNumber]
}
