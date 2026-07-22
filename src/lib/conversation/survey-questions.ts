import type { InlineKeyboardButton } from '@/types/telegram'

export interface SurveyQuestion {
  index: number // 1-16
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

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
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
      [{ text: 'Panamá', callback_data: 'country:Panamá' }],
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
    text: '¿En qué municipio o cantón vives?',
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
  {
    index: 9,
    fieldName: 'educationPsh',
    text: '📋💚 Importante: Las siguientes preguntas son solo para segmentar el hogar. 🔒 Tus datos están seguros y nunca serán compartidos. 👉 Recuerda: lo único que se analiza son tus registros de compra 🛒.\n\n¿Cuál es el nivel educativo alcanzado por la persona que se identifica como Principal Sostén del Hogar (PSH)?',
    inputType: 'button',
    buttons: [
      [
        { text: 'No alfabetizado', callback_data: 'educationPsh:No alfabetizado' },
        {
          text: 'Alfabetizado (sin escuela)',
          callback_data: 'educationPsh:Alfabetizado pero no en escuela normal',
        },
      ],
      [
        { text: 'Primaria Incompleta', callback_data: 'educationPsh:Primaria Incompleta' },
        { text: 'Primaria Completa', callback_data: 'educationPsh:Primaria Completa' },
      ],
      [
        { text: 'Secundaria Incompleta', callback_data: 'educationPsh:Secundaria Incompleta' },
        { text: 'Secundaria Completa', callback_data: 'educationPsh:Secundaria Completa' },
      ],
      [
        { text: 'Bachillerato Incompleto', callback_data: 'educationPsh:Bachillerato Incompleto' },
        { text: 'Bachillerato Completo', callback_data: 'educationPsh:Bachillerato Completo' },
      ],
      [
        { text: 'Universidad Incompleta', callback_data: 'educationPsh:Universidad Incompleta' },
        { text: 'Universidad Completa', callback_data: 'educationPsh:Universidad Completa' },
      ],
      [
        { text: 'Pos Grado Incompleto', callback_data: 'educationPsh:Pos Grado Incompleto' },
        { text: 'Pos Grado Completo', callback_data: 'educationPsh:Pos Grado Completo' },
      ],
    ],
  },
  {
    index: 10,
    fieldName: 'cars',
    text: '¿De cuántos autos dispone regularmente este hogar?',
    inputType: 'button',
    buttons: [
      [
        { text: '0', callback_data: 'cars:0' },
        { text: '1', callback_data: 'cars:1' },
        { text: '2 o más', callback_data: 'cars:2 o más' },
      ],
    ],
  },
  {
    index: 11,
    fieldName: 'domesticHelp',
    text: '¿Este hogar cuenta actualmente con apoyo de servicio doméstico?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sí', callback_data: 'domesticHelp:true' },
        { text: 'No', callback_data: 'domesticHelp:false' },
      ],
    ],
  },
  {
    index: 12,
    fieldName: 'householdSize',
    text: '¿Cuántas personas residen habitualmente en este hogar?',
    inputType: 'free_text',
  },
  {
    index: 13,
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
    index: 14,
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
  {
    index: 15,
    fieldName: 'bedrooms',
    text: '¿Cuántas habitaciones destinadas exclusivamente para dormir tiene este hogar?',
    inputType: 'free_text',
  },
  {
    index: 16,
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
    index: 17,
    fieldName: 'shoppingCategories',
    text: `🛍️ ¿Cuáles de estas categorías compras en una semana típica? Puedes elegir todas las que apliquen:\n\n${SHOPPING_CATEGORIES_TEXT}\n\n(Puedes responder indicando los números de las categorías directamente)`,
    inputType: 'free_text',
  },
  {
    index: 18,
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
    index: 19,
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

/** Single source of truth for the survey's total question count — never hardcode this. */
export const SURVEY_QUESTION_COUNT = SURVEY_QUESTIONS.length
