import type { InlineKeyboardButton } from '@/types/telegram'

export interface SurveyQuestion {
  index: number // 1-16
  fieldName: string
  text: string
  inputType: 'free_text' | 'button'
  buttons?: InlineKeyboardButton[][]
}

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
        { text: 'Hombre', callback_data: 'gender:Hombre' },
        { text: 'Mujer', callback_data: 'gender:Mujer' },
      ],
    ],
  },
  {
    index: 8,
    fieldName: 'educationPsh',
    text: '📋💚 Importante: Las siguientes preguntas son solo para segmentar el hogar. 🔒 Tus datos están seguros y nunca serán compartidos. 👉 Recuerda: lo único que se analiza son tus registros de compra 🛒.\n\n¿Cuál es el nivel educativo alcanzado por la persona que se identifica como Principal Sostén del Hogar (PSH)?',
    inputType: 'button',
    buttons: [
      [
        { text: 'Sin instrucción formal', callback_data: 'educationPsh:Sin instrucción formal' },
        { text: 'Primaria Incompleta', callback_data: 'educationPsh:Primaria Incompleta' },
      ],
      [
        { text: 'Primaria Completa', callback_data: 'educationPsh:Primaria Completa' },
        { text: 'Sec. Incompleta', callback_data: 'educationPsh:Sec. Incompleta' },
      ],
      [
        { text: 'Secundaria Completa', callback_data: 'educationPsh:Secundaria Completa' },
        { text: 'Bach. Incompleto', callback_data: 'educationPsh:Bach. Incompleto' },
      ],
      [
        { text: 'Bach. Completo', callback_data: 'educationPsh:Bach. Completo' },
        { text: 'Univ. Incompleta', callback_data: 'educationPsh:Univ. Incompleta' },
      ],
      [
        { text: 'Universidad Completa', callback_data: 'educationPsh:Universidad Completa' },
        { text: 'Posgrado', callback_data: 'educationPsh:Posgrado' },
      ],
    ],
  },
  {
    index: 9,
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
    index: 10,
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
    index: 11,
    fieldName: 'householdSize',
    text: '¿Cuántas personas residen habitualmente en este hogar?',
    inputType: 'free_text',
  },
  {
    index: 12,
    fieldName: 'bedrooms',
    text: '¿Cuántas habitaciones destinadas exclusivamente para dormir tiene este hogar?',
    inputType: 'free_text',
  },
  {
    index: 13,
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
    index: 14,
    fieldName: 'shoppingCategories',
    text: '🛍️ ¿Cuáles de estas categorías compras en una semana típica? Puedes elegir todas las que apliquen:\n\n1. Canasta básica\n2. Lácteos\n3. Bebidas\n4. Snacks/Botanas\n5. Cuidado personal\n6. Prod. de limpieza\n7. Cuidado del bebé\n8. Mascotas\n\n(Puedes responder indicando los números de las categorías directamente)',
    inputType: 'free_text',
  },
  {
    index: 15,
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
    index: 16,
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
