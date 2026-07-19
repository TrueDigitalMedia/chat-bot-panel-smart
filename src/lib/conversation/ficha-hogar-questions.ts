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
