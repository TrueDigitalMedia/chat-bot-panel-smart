import type { InlineKeyboardButton } from '@/types/telegram'
import type { FichaHogarFieldName } from '@/types/lead'

export interface FichaHogarQuestion {
  index: number // 1-7
  fieldName: FichaHogarFieldName
  text: string
  inputType: 'free_text' | 'button'
  buttons?: InlineKeyboardButton[][]
}

export const FICHA_HOGAR_QUESTIONS: FichaHogarQuestion[] = [
  {
    index: 1,
    fieldName: 'conflictOfInterest',
    text: '¿Trabajas tú o alguien en tu hogar en publicidad, investigación de mercados, medios de comunicación o la industria alimentaria?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'conflictOfInterest:true' },
        { text: 'No', callback_data: 'conflictOfInterest:false' },
      ],
    ],
  },
  {
    index: 2,
    fieldName: 'hasInternet',
    text: '¿Tienen acceso a internet en tu hogar?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'hasInternet:true' },
        { text: 'No', callback_data: 'hasInternet:false' },
      ],
    ],
  },
  {
    index: 3,
    fieldName: 'relationshipToHoh',
    text: '¿Cuál es tu parentesco con el Jefe de Familia?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Jefe de Familia', callback_data: 'relationshipToHoh:Jefe de Familia' },
        { text: 'Cónyuge', callback_data: 'relationshipToHoh:Cónyuge' },
      ],
      [
        { text: 'Hijo/a', callback_data: 'relationshipToHoh:Hijo/a' },
        { text: 'Padre/Madre', callback_data: 'relationshipToHoh:Padre/Madre' },
      ],
      [{ text: 'Otro', callback_data: 'relationshipToHoh:Otro' }],
    ],
  },
  {
    index: 4,
    fieldName: 'dateOfBirth',
    text: '¿Cuál es tu fecha de nacimiento? (DD/MM/AAAA)',
    inputType: 'free_text',
  },
  {
    index: 5,
    fieldName: 'hasHealthCondition',
    text: '¿Tienes alguna condición de salud permanente que no te permita contestar estudios?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'hasHealthCondition:true' },
        { text: 'No', callback_data: 'hasHealthCondition:false' },
      ],
    ],
  },
  {
    index: 6,
    fieldName: 'unlimitedDataPlan',
    text: '¿Tu smartphone cuenta con un plan de datos móviles ilimitado?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'unlimitedDataPlan:true' },
        { text: 'No', callback_data: 'unlimitedDataPlan:false' },
      ],
    ],
  },
  {
    index: 7,
    fieldName: 'petCount',
    text: '¿Cuántas mascotas (perros y/o gatos) hay en tu hogar?',
    inputType: 'free_text',
  },
]

export const FICHA_HOGAR_QUESTION_COUNT = FICHA_HOGAR_QUESTIONS.length

/**
 * Ecuador Ficha Hogar (doc/ecuador/flujo_kantar_ecuador.md §4) — Q1..Q6. Same field set as
 * the shared list minus `hasInternet` (Ecuador asks internet in Phase 1), plus the
 * sensitive-industry screener that Ecuador moved out of Phase 1. Re-indexed by
 * resolveFichaHogarQuestions. `conflictOfInterest` and `hasHealthCondition` are the two
 * confirmed discard gates (see phase-4.ts + CountryConfig.fichaHogarHealthConditionDisqualifies).
 */
/**
 * México Ficha Hogar (doc/mexico/flujo_preguntas_panelsmart.md §4) — Q1..Q7. Differs from
 * the shared list: conflictOfInterest keeps México's own (longer, doc-accurate) wording and
 * is asked ONLY here — not in Phase 1 (it used to be duplicated there; see mexico.ts) —
 * relationshipToHoh has the full 8-option catalog from the doc instead of a 5-option
 * shortlist, and hasInternet is replaced by internetServiceType (3 options: Propio /
 * Gratuito del gobierno / Compartido) per doc §4 P2b.
 */
export const MEXICO_FICHA_HOGAR_QUESTIONS: FichaHogarQuestion[] = [
  {
    index: 1,
    fieldName: 'conflictOfInterest',
    text: 'Muchas gracias por su interés en participar de nuestro proyecto.\n\n¿Usted o algún integrante de su hogar trabaja en: agencia de publicidad, empresa de investigación de mercado, radio/periódico/TV, o es propietario de industria o comercio de alimentos, bebidas, higiene personal, limpieza del hogar, ropa o zapatos?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'conflictOfInterest:true' },
        { text: 'No', callback_data: 'conflictOfInterest:false' },
      ],
    ],
  },
  {
    index: 2,
    fieldName: 'internetServiceType',
    text: '¿Qué tipo de servicio de internet tienen en casa?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Propio', callback_data: 'internetServiceType:Propio' },
        { text: 'Gratuito del gobierno', callback_data: 'internetServiceType:Gratuito del gobierno' },
      ],
      [{ text: 'Compartido', callback_data: 'internetServiceType:Compartido' }],
    ],
  },
  {
    index: 3,
    fieldName: 'relationshipToHoh',
    text: '¿Cuál es tu parentesco con el Jefe de Familia?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Jefe de Familia', callback_data: 'relationshipToHoh:Jefe de Familia' },
        { text: 'Cónyuge', callback_data: 'relationshipToHoh:Cónyuge' },
      ],
      [
        { text: 'Hijo(a)/Hijastro(a)', callback_data: 'relationshipToHoh:Hijo(a)/Hijastro(a)' },
        { text: 'Padre/Madre/Suegro', callback_data: 'relationshipToHoh:Padre/Madre/Suegro' },
      ],
      [
        { text: 'Agregado', callback_data: 'relationshipToHoh:Agregado' },
        { text: 'Inquilino', callback_data: 'relationshipToHoh:Inquilino' },
      ],
      [
        { text: 'Empleada doméstica', callback_data: 'relationshipToHoh:Empleada doméstica' },
        {
          text: 'Pariente de empleada doméstica',
          callback_data: 'relationshipToHoh:Pariente de empleada doméstica',
        },
      ],
    ],
  },
  {
    index: 4,
    fieldName: 'dateOfBirth',
    text: '¿Cuál es tu fecha de nacimiento? (DD/MM/AAAA)',
    inputType: 'free_text',
  },
  {
    index: 5,
    fieldName: 'hasHealthCondition',
    text: '¿Tienes alguna condición de salud permanente que no te permita contestar estudios?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'hasHealthCondition:true' },
        { text: 'No', callback_data: 'hasHealthCondition:false' },
      ],
    ],
  },
  {
    index: 6,
    fieldName: 'unlimitedDataPlan',
    text: '¿Tu smartphone cuenta con un plan de datos móviles ilimitado?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'unlimitedDataPlan:true' },
        { text: 'No', callback_data: 'unlimitedDataPlan:false' },
      ],
    ],
  },
  {
    index: 7,
    fieldName: 'petCount',
    text: '¿Cuántas mascotas (perros y/o gatos) hay en tu hogar? (escribe 0 si no tienes)',
    inputType: 'free_text',
  },
]

export const ECUADOR_FICHA_HOGAR_QUESTIONS: FichaHogarQuestion[] = [
  {
    index: 1,
    fieldName: 'conflictOfInterest',
    text: '¿Trabajas tú o alguien de tu hogar en: agencia de publicidad, investigación de mercados, radio/prensa/TV, o eres dueño de una industria de alimentos, bebidas, higiene, limpieza, ropa o calzado?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'conflictOfInterest:true' },
        { text: 'No', callback_data: 'conflictOfInterest:false' },
      ],
    ],
  },
  {
    index: 2,
    fieldName: 'relationshipToHoh',
    text: '¿Cuál es tu parentesco con el Jefe de Familia?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Jefe de Familia', callback_data: 'relationshipToHoh:Jefe de Familia' },
        { text: 'Cónyuge', callback_data: 'relationshipToHoh:Cónyuge' },
      ],
      [
        { text: 'Hijo/a', callback_data: 'relationshipToHoh:Hijo/a' },
        { text: 'Padre/Madre', callback_data: 'relationshipToHoh:Padre/Madre' },
      ],
      [{ text: 'Otro pariente', callback_data: 'relationshipToHoh:Otro' }],
    ],
  },
  {
    index: 3,
    fieldName: 'dateOfBirth',
    text: '¿Cuál es tu fecha de nacimiento? (DD/MM/AAAA)',
    inputType: 'free_text',
  },
  {
    index: 4,
    fieldName: 'hasHealthCondition',
    text: '¿Tienes alguna condición de salud permanente que no te permita contestar un estudio?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'hasHealthCondition:true' },
        { text: 'No', callback_data: 'hasHealthCondition:false' },
      ],
    ],
  },
  {
    index: 5,
    fieldName: 'unlimitedDataPlan',
    text: '¿Tu smartphone cuenta con un plan de datos móviles ilimitado?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'unlimitedDataPlan:true' },
        { text: 'No', callback_data: 'unlimitedDataPlan:false' },
      ],
    ],
  },
  {
    index: 6,
    fieldName: 'petCount',
    text: '¿Cuántas mascotas (perros y/o gatos) hay en tu hogar? (escribe 0 si no tienes)',
    inputType: 'free_text',
  },
]
