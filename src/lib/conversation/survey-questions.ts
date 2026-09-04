import type { InlineKeyboardButton } from '@/types/telegram'

export interface SurveyQuestion {
  index: number // 1-based position in the resolved list (see survey-plan.ts resolveSurveyQuestions)
  fieldName: string
  text: string
  inputType: 'free_text' | 'button'
  buttons?: InlineKeyboardButton[][]
}

/**
 * Canonical Q14 shopping-category list (id shown/expected in the numbered question
 * text → label). Single source of truth — imported by field-map.ts (MySQL sync
 * labels) and extract-survey-fields.ts (LLM extraction hint) so both stay in sync
 * with what's actually shown to the user here.
 */
export const SHOPPING_CATEGORIES: ReadonlyArray<{ id: number; label: string }> = [
  { id: 1, label: 'Canasta básica' },
  { id: 2, label: 'Lácteos' },
  { id: 3, label: 'Bebidas' },
  { id: 4, label: 'Snacks/Botanas' },
  { id: 5, label: 'Cuidado personal' },
  { id: 6, label: 'Prod. de limpieza' },
  { id: 7, label: 'Cuidado del bebé' },
  { id: 8, label: 'Mascotas' },
] as const

const SHOPPING_CATEGORIES_TEXT = SHOPPING_CATEGORIES.map((c) => `${c.id}. ${c.label}`).join('\n')

/**
 * Country-agnostic questions asked before any country-specific NSE block. `index` is a
 * placeholder — resolveSurveyQuestions() (survey-plan.ts) re-indexes every question by
 * its position in the resolved list for a given country.
 */
export const SHARED_PREFIX: SurveyQuestion[] = [
  {
    index: 1,
    fieldName: 'fullName',
    text: 'Escribe tu nombre y apellido',
    inputType: 'free_text',
  },
  {
    index: 2,
    fieldName: 'country',
    text: '¿En qué país te encuentras?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Guatemala', callback_data: 'country:Guatemala' },
        { text: 'Honduras', callback_data: 'country:Honduras' },
      ],
      [
        { text: 'El Salvador', callback_data: 'country:El Salvador' },
        { text: 'Nicaragua', callback_data: 'country:Nicaragua' },
      ],
      [
        { text: 'Costa Rica', callback_data: 'country:Costa Rica' },
        { text: 'Rep. Dominicana', callback_data: 'country:Rep. Dominicana' },
      ],
      [
        { text: 'Panamá', callback_data: 'country:Panamá' },
        { text: 'Ecuador', callback_data: 'country:Ecuador' },
      ],
    ],
  },
  {
    index: 3,
    fieldName: 'stateProvince',
    text: '¿En qué provincia/departamento vives?',
    inputType: 'free_text',
  },
  {
    index: 4,
    fieldName: 'municipality',
    // 'Cantón' is Costa Rica/Ecuador-specific terminology, overridden for those countries
    // via getCountryConfig(country).geoHierarchy — every other country just gets the
    // generic 'municipio' wording from here.
    text: '¿En qué municipio vives?',
    inputType: 'free_text',
  },
  {
    index: 5,
    fieldName: 'neighborhood',
    text: '¿En qué parroquia, barrio o distrito vives?',
    inputType: 'free_text',
  },
  {
    index: 6,
    fieldName: 'email',
    text: '✅ ¡Perfecto! Ahora, por favor, escribe tu correo electrónico:',
    inputType: 'free_text',
  },
  {
    index: 7,
    fieldName: 'gender',
    text: '¿Cuál es tu género?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Masculino', callback_data: 'gender:Masculino' },
        { text: 'Femenino', callback_data: 'gender:Femenino' },
      ],
    ],
  },
  {
    index: 8,
    fieldName: 'age',
    text: '¿Cuántos años cumplidos tienes?',
    inputType: 'free_text',
  },
]

/**
 * Pregnancy / baby-under-36-months questions — the unlimited quota exception
 * (constitution Principle IV) applies uniformly across every country, so every
 * CountryConfig.scoringQuestions splices this block in (see cam.ts / ecuador.ts).
 * Kept as one shared constant instead of duplicating the copy per country.
 */
export const PREGNANCY_BABY_QUESTIONS: SurveyQuestion[] = [
  {
    index: 0,
    fieldName: 'isPregnant',
    text: '¿Te encuentras actualmente embarazada?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'isPregnant:true' },
        { text: 'No', callback_data: 'isPregnant:false' },
      ],
    ],
  },
  {
    index: 0,
    fieldName: 'hasBabyUnder3',
    text: '¿Vive usted con un bebé menor de 3 años?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'hasBabyUnder3:true' },
        { text: 'No', callback_data: 'hasBabyUnder3:false' },
      ],
    ],
  },
]

/** Country-agnostic questions asked after every country's NSE block. */
export const SHARED_SUFFIX: SurveyQuestion[] = [
  {
    index: 0,
    fieldName: 'shoppingFrequency',
    text: '¿Con qué frecuencia realizas las compras para el hogar?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Diario', callback_data: 'shoppingFrequency:Diario' },
        { text: '2-3 veces por semana', callback_data: 'shoppingFrequency:2-3 veces por semana' },
      ],
      [
        { text: 'Semanal', callback_data: 'shoppingFrequency:Semanal' },
        { text: 'Quincenal', callback_data: 'shoppingFrequency:Quincenal' },
        { text: 'Mensual', callback_data: 'shoppingFrequency:Mensual' },
      ],
    ],
  },
  {
    index: 0,
    fieldName: 'shoppingCategories',
    text: `🛍️ ¿Cuáles de estas categorías compras en una semana típica? Puedes elegir todas las que apliquen:\n\n${SHOPPING_CATEGORIES_TEXT}\n\n(Puedes responder indicando los números de las categorías directamente)`,
    inputType: 'free_text',
  },
  {
    index: 0,
    fieldName: 'contactChannel',
    text: '¿Cómo te gustaría ser contactado/a por PanelSmart?',
    inputType: 'button',
    buttons: [
      [
        { text: 'WhatsApp', callback_data: 'contactChannel:WhatsApp' },
        { text: 'Llamada telefónica', callback_data: 'contactChannel:Llamada telefónica' },
      ],
    ],
  },
  {
    index: 0,
    fieldName: 'contactSchedule',
    text: '¿En qué horario del día puedes ser contactado/a?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Mañana (9-12hs)', callback_data: 'contactSchedule:Mañana (9-12hs)' },
        { text: 'Tarde (13-17hs)', callback_data: 'contactSchedule:Tarde (13-17hs)' },
        { text: 'Noche (18-21hs)', callback_data: 'contactSchedule:Noche (18-21hs)' },
      ],
    ],
  },
]

// NOTE: the pre-014 fixed SURVEY_QUESTIONS / SURVEY_QUESTION_COUNT constants are gone.
// Every caller now goes through `resolveSurveyQuestions(country)` / `surveyQuestionCount(country)`
// in `./survey-plan` — for a CAM/RD country these are byte-identical to the old fixed
// array (see tests/unit/country-config-registry.test.ts), so behavior is unchanged.
