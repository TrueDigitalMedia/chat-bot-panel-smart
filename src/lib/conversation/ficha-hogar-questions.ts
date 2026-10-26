import type { InlineKeyboardButton } from '@/types/telegram'
import type { FichaHogarFieldName } from '@/types/lead'

export interface FichaHogarQuestion {
  index: number // 1-7
  fieldName: FichaHogarFieldName
  text: string
  inputType: 'free_text' | 'button'
  buttons?: InlineKeyboardButton[][]
}

/** Los cuatro sectores que descalifican, tal como los enumera el cliente. */
const CONFLICT_OF_INTEREST_SECTORS = [
  '1. Agencia de publicidad',
  '2. Empresa de investigación de mercados',
  '3. Radio, periódico o televisión',
  '4. Dueño/a de una industria o negocio de alimentos, bebidas, higiene personal, limpieza del hogar, ropa o calzado',
].join('\n')

const CONFLICT_OF_INTEREST_SECTORS_TEXT = [
  'Antes de comenzar, necesito confirmar una cosa.',
  '',
  '¿Trabajas tú o alguna persona de tu hogar en alguno de estos sectores?',
  CONFLICT_OF_INTEREST_SECTORS,
  '',
  'Responde Sí si aplica alguno, o No si ninguno aplica.',
].join('\n')

/**
 * La repregunta: el primer "sí" ya no descalifica (ver el gate en phases/phase-4.ts).
 *
 * Existe porque la pregunta sobre-dispara — un 25% de los que llegan a la ficha contestaban que
 * sí, contra una incidencia real de un dígito. El cuarto sector es el que se lleva puesta a la
 * gente: dice "dueño/a", pero quien trabaja en un súper o en un comedor lo lee como propio. Por
 * eso la repregunta vuelve a enumerar los sectores y aclara ese punto en vez de limitarse a
 * preguntar "¿estás seguro?".
 *
 * Los callbacks son los MISMOS que los de la pregunta original a propósito: así el lead que
 * contesta escribiendo "si" en lugar de tocar el botón entra por el mismo camino de siempre
 * (matchButtonChoice / interpretButtonAnswer), y lo único que distingue un intento del otro es
 * `ficha_hogar_profiles.conflict_of_interest_reasked`.
 */
export const CONFLICT_OF_INTEREST_RECONFIRM: {
  text: string
  buttons: InlineKeyboardButton[][]
} = {
  text: [
    'Solo para estar seguros, porque esa respuesta deja la participación afuera.',
    '',
    '¿Tú o alguien de tu hogar trabaja realmente en alguno de estos sectores?',
    CONFLICT_OF_INTEREST_SECTORS,
    '',
    'Ojo: en el punto 4 la pregunta es por ser dueño/a del negocio. Trabajar en un supermercado, un restaurante o una tienda no cuenta.',
  ].join('\n'),
  buttons: [
    [
      { text: 'Sí, confirmo', callback_data: 'conflictOfInterest:true' },
      { text: 'No, me equivoqué', callback_data: 'conflictOfInterest:false' },
    ],
  ],
}

export const FICHA_HOGAR_QUESTIONS: FichaHogarQuestion[] = [
  {
    index: 1,
    fieldName: 'conflictOfInterest',
    // Enumerar los sectores en vez de resumirlos ("la industria alimentaria") baja los falsos
    // positivos: con el texto resumido CAM descartaba 24-36% de los que llegan a la ficha,
    // contra 11% de Ecuador, que ya los enumeraba. Es el texto que usa el cliente.
    text: CONFLICT_OF_INTEREST_SECTORS_TEXT,
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
 * México Ficha Hogar (doc/mexico/flujo_preguntas_panelsmart.md §4) — Q1..Q8. Differs from
 * the shared list: conflictOfInterest keeps México's own (longer, doc-accurate) wording and
 * is asked ONLY here — not in Phase 1 (it used to be duplicated there; see mexico.ts) —
 * codigoPostal moved here too (doc §4 P2, right after the screening question; it used to be
 * asked in Phase 1, in the wrong fase entirely) — relationshipToHoh has the full 8-option
 * catalog from the doc instead of a 5-option shortlist, and hasInternet no se pregunta acá.
 *
 * internetServiceType estuvo en esta lista hasta el ajuste del cliente del 2026-09-28:
 * pasó a Fase 1 (countries/mexico.ts) para quedar pegada a homeInternet y ser la que
 * aporta los 32 puntos de internet al NSE. `resolveFichaHogarQuestions` reindexa 1..N,
 * así que sacarla de acá renumera el resto sin más cambios.
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
    fieldName: 'codigoPostal',
    text: '¡Perfecto! Empecemos. 🏠\n\nLa primera pregunta es:\n¿Cuál es el código postal de tu domicilio? (5 dígitos)',
    inputType: 'free_text',
  },
  {
    index: 4,
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
    index: 5,
    fieldName: 'dateOfBirth',
    text: '¿Cuál es tu fecha de nacimiento? (DD/MM/AAAA)',
    inputType: 'free_text',
  },
  {
    index: 6,
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
    index: 7,
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
    index: 8,
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
