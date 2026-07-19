import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { fichaHogarProfiles } from '@/lib/db/schema'
import { sendText, sendInlineKeyboard } from '@/lib/messaging/send'
import { FICHA_HOGAR_FIELDS, type FichaHogarFieldName, type Lead } from '@/types/lead'
import { FICHA_HOGAR_QUESTIONS } from './ficha-hogar-questions'
import { sendFichaHogarQuestion } from './phases/phase-4'
import type { InlineKeyboardButton } from '@/types/telegram'

// Small standalone correction module for Ficha Hogar (spec 008, research.md R3) —
// same UX pattern as src/lib/conversation/correction.ts, not a shared implementation
// (that module is bound to SURVEY_FIELDS/survey_profiles).

export const CORRECT_FH_MENU = 'correctfh:menu'
export const CORRECT_FH_CANCEL = 'correctfh:cancel'

const FIELD_LABELS: Record<FichaHogarFieldName, string> = {
  conflictOfInterest: 'Conflicto de interés',
  hasInternet: 'Acceso a internet',
  relationshipToHoh: 'Parentesco con Jefe de Familia',
  dateOfBirth: 'Fecha de nacimiento',
  hasHealthCondition: 'Condición de salud',
  unlimitedDataPlan: 'Plan de datos ilimitado',
  petCount: 'Número de mascotas',
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (value == null) return '—'
  return String(value)
}

export function isFichaHogarCorrectionCallback(data: string | undefined): boolean {
  return !!data && (data === CORRECT_FH_MENU || data === CORRECT_FH_CANCEL || data.startsWith('correctfh:field:'))
}

/** Simple NL trigger — same "open menu" phrases as Phase 1's detector, no field+value parsing. */
export function detectsFichaHogarCorrectionIntent(text: string): boolean {
  const lower = text.trim().toLowerCase()
  if (!lower) return false
  return (
    /^(quiero\s+)?(corregir|cambiar|modificar|actualizar|editar)(\s+(una\s+)?respuesta)?$/i.test(lower) ||
    /corregir\s+(una\s+)?respuesta/i.test(lower) ||
    /cambiar\s+(una\s+)?respuesta/i.test(lower) ||
    /me\s+equivoqu[eé]/i.test(lower)
  )
}

async function getProfile(leadId: string) {
  const [profile] = await db
    .select()
    .from(fichaHogarProfiles)
    .where(eq(fichaHogarProfiles.leadId, leadId))
    .limit(1)
  return profile
}

export async function showFichaHogarCorrectionMenu(lead: Lead): Promise<void> {
  const profile = await getProfile(lead.id)
  if (!profile) {
    await sendText(lead, 'Aún no hay respuestas de Ficha Hogar para corregir.')
    return
  }
  const rec = profile as unknown as Record<string, unknown>
  const filled = FICHA_HOGAR_FIELDS.filter((f) => rec[f] !== null && rec[f] !== undefined)
  if (filled.length === 0) {
    await sendText(lead, 'Aún no hay respuestas de Ficha Hogar para corregir.')
    return
  }

  const buttons: InlineKeyboardButton[][] = filled.map((f) => [
    {
      text: `${FIELD_LABELS[f]}: ${formatValue(rec[f])}`.slice(0, 64),
      callback_data: `correctfh:field:${f}`,
    },
  ])
  buttons.push([{ text: 'Cancelar', callback_data: CORRECT_FH_CANCEL }])

  await sendInlineKeyboard(
    lead,
    'Elige la pregunta de Ficha Hogar que quieres corregir. Continuaremos desde ahí.',
    buttons,
  )
}

export async function restartFichaHogarFromField(lead: Lead, field: FichaHogarFieldName): Promise<void> {
  const idx = FICHA_HOGAR_QUESTIONS.findIndex((q) => q.fieldName === field) + 1
  if (idx < 1) return

  await db
    .update(fichaHogarProfiles)
    .set({ [field]: null, questionIndex: idx, updatedAt: new Date() } as Record<string, unknown>)
    .where(eq(fichaHogarProfiles.leadId, lead.id))

  await sendText(lead, `Ok, volvamos a "${FIELD_LABELS[field]}".`)
  await sendFichaHogarQuestion(lead, idx)
}

export async function cancelFichaHogarCorrection(lead: Lead): Promise<void> {
  const profile = await getProfile(lead.id)
  await sendText(lead, 'Corrección cancelada. Seguimos donde íbamos.')
  const idx = profile?.questionIndex ?? 0
  if (idx >= 1 && idx <= FICHA_HOGAR_QUESTIONS.length) {
    await sendFichaHogarQuestion(lead, idx)
  }
}

/** Handle correction callbacks (menu / field pick / cancel). Returns true if handled. */
export async function handleFichaHogarCorrectionFlow(
  lead: Lead,
  callbackData: string | undefined,
): Promise<boolean> {
  if (!callbackData) return false

  if (callbackData === CORRECT_FH_MENU) {
    await showFichaHogarCorrectionMenu(lead)
    return true
  }
  if (callbackData === CORRECT_FH_CANCEL) {
    await cancelFichaHogarCorrection(lead)
    return true
  }
  if (callbackData.startsWith('correctfh:field:')) {
    const field = callbackData.slice('correctfh:field:'.length) as FichaHogarFieldName
    if (!(FICHA_HOGAR_FIELDS as readonly string[]).includes(field)) {
      await sendText(lead, 'Campo no válido.')
      return true
    }
    await restartFichaHogarFromField(lead, field)
    return true
  }

  return false
}
