/**
 * CountryConfig for Ecuador — see specs/014-ecuador-onboarding. Source of truth for all
 * wording/options: docs/ecuador/Cuestionario Ecuador.docx and
 * docs/ecuador/Muestra Regiones NSE Ecuador.xlsx (point tables in data/scoring/ecuador-nse.json).
 */
import type { InlineKeyboardButton } from '@/types/telegram'
import type { SurveyQuestion } from '@/lib/conversation/survey-questions'
import { PREGNANCY_BABY_QUESTIONS } from '@/lib/conversation/survey-questions'
import { computeEcuadorNse } from '@/lib/scoring/ecuador-nse'
import { lookupEcuadorNseRegion } from '@/lib/geo/ecuador-nse-catalog'
import type { CountryConfig, GeoHierarchy } from './types'

const HEALTH_INSURANCE_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'healthInsurancePsh',
  text: '¿El principal sostén del hogar tiene seguro de salud?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Ninguno', callback_data: 'healthInsurancePsh:Ninguno' },
      { text: 'IESS', callback_data: 'healthInsurancePsh:IESS' },
    ],
    [
      { text: 'Issfa (militares) Gobierno', callback_data: 'healthInsurancePsh:Issfa (militares) Gobierno' },
      { text: 'Isspol (policías)', callback_data: 'healthInsurancePsh:Isspol (policías)' },
    ],
    [{ text: 'Privada', callback_data: 'healthInsurancePsh:Privada' }],
  ],
}

const MONTHLY_INCOME_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'monthlyIncome',
  text: 'Ingresos del hogar mensualmente',
  inputType: 'button',
  buttons: [
    [
      { text: 'Hasta $400', callback_data: 'monthlyIncome:Hasta $400' },
      { text: '$401 - $700', callback_data: 'monthlyIncome:De $401 hasta $700' },
    ],
    [
      { text: '$701 - $1.000', callback_data: 'monthlyIncome:De $701 hasta $1.000' },
      { text: '$1.001 - $2.000', callback_data: 'monthlyIncome:De $1.001 hasta $2.000' },
    ],
    [
      { text: '$2.001 - $3.000', callback_data: 'monthlyIncome:De $2.001 hasta $3.000' },
      { text: 'Más de $3.000', callback_data: 'monthlyIncome:Más de $3.000' },
    ],
  ],
}

const DWELLING_FINISHES_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'dwellingFinishes',
  text: 'Acabados de la vivienda',
  inputType: 'button',
  buttons: [
    [{ text: 'Tabla/madera, techo de desechos o cartón', callback_data: 'dwellingFinishes:Casa de Tabla/Madera techo de Desechos o cartón' }],
    [{ text: 'Tabla/madera, techo de eternit o zinc', callback_data: 'dwellingFinishes:Casa de Tabla/Madera techo de Eternit o Zinc' }],
    [{ text: 'Cemento, techo de eternit o zinc', callback_data: 'dwellingFinishes:Casa de Cemento Techo de Eternit o Zinc' }],
    [{ text: 'Cemento/ladrillo, techo de loza o teja', callback_data: 'dwellingFinishes:Casa de Cemento/Ladrillo Techo de Loza o Teja' }],
    [{ text: 'Otro (acabados de lujo)', callback_data: 'dwellingFinishes:Otro (acabados de lujo)' }],
  ],
}

const FLOOR_MATERIAL_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'floorMaterial',
  text: 'Material de piso que más predomina',
  inputType: 'button',
  buttons: [
    [{ text: 'Duela, parquet, tablón o piso flotante', callback_data: 'floorMaterial:Duela, parquet, tablón o piso flotante' }],
    [{ text: 'Cerámica, baldosa, vinil o marmetón', callback_data: 'floorMaterial:Cerámica, baldosa, vinil o marmetón' }],
    [{ text: 'Ladrillo o cemento', callback_data: 'floorMaterial:Ladrillo o cemento' }],
    [
      { text: 'Tierra/Caña', callback_data: 'floorMaterial:Tierra/Caña' },
      { text: 'Otros materiales', callback_data: 'floorMaterial:Otros materiales' },
    ],
  ],
}

const VEHICLE_COUNT_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'vehicleCount',
  text: 'Número de vehículos (de uso personal, excepto de uso para taxi o trabajo)',
  inputType: 'button',
  buttons: [
    [
      { text: '0', callback_data: 'vehicleCount:0' },
      { text: '1', callback_data: 'vehicleCount:1' },
      { text: '2', callback_data: 'vehicleCount:2' },
    ],
    [
      { text: '3', callback_data: 'vehicleCount:3' },
      { text: '4 o más', callback_data: 'vehicleCount:4 o más' },
    ],
  ],
}

const OCCUPATION_BUTTONS: InlineKeyboardButton[][] = [
  [{ text: 'Directivo admón. pública/empresas', callback_data: '__FIELD__:Personal directivo de la Administración Pública y de empresas' }],
  [{ text: 'Profesionales científicos e intelectuales', callback_data: '__FIELD__:Profesionales científicos e intelectuales' }],
  [{ text: 'Técnicos y profesionales de nivel medio', callback_data: '__FIELD__:Técnicos y profesionales de nivel medio' }],
  [{ text: 'Empleados de oficina', callback_data: '__FIELD__:Empleados de oficina' }],
  [{ text: 'Trabajadores de servicios y comerciantes', callback_data: '__FIELD__:Trabajador de los servicios y comerciantes' }],
  [{ text: 'Trab. calificados agropecuarios y pesqueros', callback_data: '__FIELD__:Trabajador calificados agropecuarios y pesqueros' }],
  [{ text: 'Oficiales, operarios y artesanos', callback_data: '__FIELD__:Oficiales operarios y artesanos' }],
  [{ text: 'Operadores de instalaciones y máquinas', callback_data: '__FIELD__:Operadores de instalaciones y máquinas' }],
  [{ text: 'Trabajadores no calificados', callback_data: '__FIELD__:Trabajadores no calificados' }],
  [{ text: 'Fuerzas Armadas', callback_data: '__FIELD__:Fuerzas Armadas' }],
  [{ text: 'Desocupados', callback_data: '__FIELD__:Desocupados' }],
  [{ text: 'Inactivos / Jubilado', callback_data: '__FIELD__:Inactivos / Jubilado' }],
]

function occupationQuestion(fieldName: 'occupationHead' | 'occupationAma', text: string): SurveyQuestion {
  return {
    index: 0,
    fieldName,
    text,
    inputType: 'button',
    buttons: OCCUPATION_BUTTONS.map((row) =>
      row.map((b) => ({ text: b.text, callback_data: b.callback_data!.replace('__FIELD__', fieldName) })),
    ),
  }
}

const EDUCATION_PSH_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'educationPsh',
  text: 'Máxima educación del Principal Sostén del Hogar',
  inputType: 'button',
  buttons: [
    [
      { text: 'Ninguno / no alfabetizado', callback_data: 'educationPsh:Ninguno- No alfabetizado' },
      { text: 'Alfabetizado (sin escuela)', callback_data: 'educationPsh:Alfabetizado pero no en escuela formal' },
    ],
    [
      { text: 'Básica incompleta', callback_data: 'educationPsh:Básica incompleta' },
      { text: 'Básica completa', callback_data: 'educationPsh:Básica completa' },
    ],
    [
      { text: 'Media incompleta', callback_data: 'educationPsh:Media incompleta' },
      { text: 'Media completa', callback_data: 'educationPsh:Media completa' },
    ],
    [
      { text: 'Técnica incompleta', callback_data: 'educationPsh:Técnica incompleta' },
      { text: 'Técnica completa', callback_data: 'educationPsh:Técnica completa' },
    ],
    [
      { text: 'Universidad incompleta', callback_data: 'educationPsh:Universidad incompleta' },
      { text: 'Universidad completa', callback_data: 'educationPsh:Universidad completa' },
    ],
    [
      { text: 'Post grado incompleto', callback_data: 'educationPsh:Post grado incompleto' },
      { text: 'Post grado completo', callback_data: 'educationPsh:Post grado completo' },
    ],
  ],
}

const HOUSEHOLD_SIZE_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'householdSize',
  text: '¿Cuántos integrantes viven en el hogar? (Si son más de 6, escribe el número)',
  inputType: 'button',
  buttons: [
    [
      { text: '1', callback_data: 'householdSize:1' },
      { text: '2', callback_data: 'householdSize:2' },
      { text: '3', callback_data: 'householdSize:3' },
    ],
    [
      { text: '4', callback_data: 'householdSize:4' },
      { text: '5', callback_data: 'householdSize:5' },
      { text: '6', callback_data: 'householdSize:6' },
    ],
  ],
}

const INTERNET_ACCESS_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'internetAccess',
  text: 'Internet',
  inputType: 'button',
  buttons: [
    [{ text: 'No internet', callback_data: 'internetAccess:No internet' }],
    [{ text: 'Internet (de celular)', callback_data: 'internetAccess:Internet (de Celular)' }],
    [{ text: 'Internet hogar (cable)', callback_data: 'internetAccess:Internet Hogar contratado (cable)' }],
    [{ text: 'Internet hogar (fibra óptica)', callback_data: 'internetAccess:Internet Hogar contratado (Fibra Op)' }],
  ],
}

const CONFLICT_OF_INTEREST_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'conflictOfInterest',
  text: 'Muchas gracias por su interés en participar de nuestro proyecto.\n\n¿Algún integrante de su hogar trabaja en: agencia de publicidad, empresa de investigación de mercado, radio/periódico/TV, o es propietario de industria o comercio de alimentos, higiene personal o limpieza?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Sí', callback_data: 'conflictOfInterest:true' },
      { text: 'No', callback_data: 'conflictOfInterest:false' },
    ],
  ],
}

/**
 * Order: screening first, then the 8 NSE variables (occupation split into head + ama,
 * scored as max() — see ecuador-nse.ts), household size, pregnancy/baby, internet.
 */
const ECUADOR_SCORING_QUESTIONS: SurveyQuestion[] = [
  CONFLICT_OF_INTEREST_QUESTION,
  HEALTH_INSURANCE_QUESTION,
  MONTHLY_INCOME_QUESTION,
  DWELLING_FINISHES_QUESTION,
  FLOOR_MATERIAL_QUESTION,
  VEHICLE_COUNT_QUESTION,
  occupationQuestion('occupationHead', '¿Cuál es la máxima ocupación del Jefe de Familia?'),
  occupationQuestion('occupationAma', '¿Cuál es la máxima ocupación del Ama de Casa?'),
  EDUCATION_PSH_QUESTION,
  HOUSEHOLD_SIZE_QUESTION,
  ...PREGNANCY_BABY_QUESTIONS,
  INTERNET_ACCESS_QUESTION,
]

const ECUADOR_GEO_HIERARCHY: GeoHierarchy = {
  stateProvinceLabel: 'provincia',
  municipalityLabel: 'cantón',
  neighborhoodLabel: 'parroquia',
}

const ECUADOR_SCREENING_INDUSTRIES: InlineKeyboardButton[][] = CONFLICT_OF_INTEREST_QUESTION.buttons!

function ecuadorValidatePhone(raw: string): { ok: boolean; normalized: string | null } {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('593')) digits = digits.slice(3)
  if (digits.startsWith('0')) digits = digits.slice(1)
  // A stripped leading '0' can leave 9 digits for a correctly-formatted 10-digit input
  // (e.g. "0987654321" -> "987654321"); accept both the 10-digit and 9-after-strip cases,
  // normalizing to 10 digits with the conventional leading 0 restored for the 9-digit case.
  if (digits.length === 9) digits = `0${digits}`
  return digits.length === 10 ? { ok: true, normalized: digits } : { ok: false, normalized: null }
}

export const ecuadorConfig: CountryConfig = {
  country: 'Ecuador',
  nseLevels: ['AB', 'C', 'D/E'],
  geoHierarchy: ECUADOR_GEO_HIERARCHY,
  scoringQuestions: ECUADOR_SCORING_QUESTIONS,
  screeningIndustries: ECUADOR_SCREENING_INDUSTRIES,
  computeNse: (answers) => {
    const result = computeEcuadorNse(answers as Parameters<typeof computeEcuadorNse>[0])
    return { points: result.points, level: result.level }
  },
  resolveNseRegion: (geo) =>
    lookupEcuadorNseRegion(geo.stateProvince, geo.municipality, geo.neighborhood),
  validatePhone: ecuadorValidatePhone,
}
