import { generateObject } from 'ai'
import { z } from 'zod'
import { chatModelPrecise, CHAT_MODEL_PRECISE_ID } from '@/lib/ai/models'
import { sanitizeInput, InputRejectedError } from '@/lib/ai/sanitize'
import { logCall } from '@/lib/db/call-log'

const SCHEMA = z.object({
  wantsToContinue: z
    .boolean()
    .describe(
      'true si el mensaje indica que el usuario quiere continuar/retomar la inscripción — ya sea porque se ' +
        'arrepiente explícitamente de haber dicho que no (ej. "me equivoqué", "perdón, sí quiero") o porque ' +
        'reafirma directamente su interés en participar/inscribirse, incluso sin mencionar el rechazo previo ' +
        '(ej. "quiero participar y ganar premios", "sí quiero inscribirme", "me interesa", "cómo me registro"). ' +
        'false para un saludo genérico sin más, una pregunta que no expresa interés en inscribirse, ruido, o ' +
        'cualquier otra cosa no relacionada con querer participar.',
    ),
})

/**
 * Free text after a decline (opt-in/D1/D2/D3 "No") can be a change of heart rather than
 * noise — phrasings vary too much ("Si perdon si quiero inscribirme", "Me equivoque al
 * responder", or a plain restated "Quiero participar y ganar premios" from someone who
 * doesn't even remember declining) for a fixed regex list, so this asks an LLM to judge
 * intent directly. Deliberately broader than just "regret" language — a user re-stating
 * interest in participating counts the same as one apologizing for the earlier "no".
 * Only ever called from a terminal not_qualified/quota_exhausted state reached via a
 * decline, so the cost is negligible in practice.
 */
export async function detectDeclineReversalIntent(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<boolean> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const sanitized = await sanitizeInput(query, { leadId: opts?.leadId, correlationId })

    const prompt = `Un usuario había respondido "No" a una pregunta de inscripción de un bot (por ejemplo: rechazar términos y condiciones, decir que no quiere ganar premios, o decir que no es quien hace las compras del hogar), y el bot le dio por terminada la conversación. Puede que el usuario ya no recuerde ese "no", o que escriba tiempo después como si fuera una conversación nueva.

Después, el usuario escribió este mensaje:

"${sanitized}"

¿Este mensaje indica que el usuario quiere continuar o retomar la inscripción? Cuenta tanto si se arrepiente explícitamente de haber dicho que no, como si simplemente reafirma su interés en participar/inscribirse/ganar premios sin mencionar el rechazo previo. Responde wantsToContinue: false si el mensaje es un saludo genérico sin más, una pregunta o comentario que no expresa interés en inscribirse, ruido, o algo no relacionado con querer participar.`

    const result = await generateObject({ model: chatModelPrecise(), schema: SCHEMA, prompt })

    await logCall({
      leadId: opts?.leadId,
      callType: 'decline_reversal_intent',
      model: CHAT_MODEL_PRECISE_ID,
      inputTokens: (result.usage as unknown as Record<string, number> | undefined)?.promptTokens,
      outputTokens: (result.usage as unknown as Record<string, number> | undefined)?.completionTokens,
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return result.object.wantsToContinue
  } catch (err) {
    if (err instanceof InputRejectedError) return false
    await logCall({
      leadId: opts?.leadId,
      callType: 'decline_reversal_intent',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return false
  }
}
