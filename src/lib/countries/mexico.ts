/**
 * CountryConfig for México — see specs/015-mexico-onboarding. Source of truth for all
 * wording/options: docs/mexico/Cuestionario Mexico.docx and
 * docs/mexico/Muestra Regiones NSE Mexico.xlsx (point tables in data/scoring/mexico-nse.json,
 * geo catalog in data/geo/mexico-nse-regions.json).
 *
 * The per-household-member roster (questionnaire §2.3.9–2.3.12: names + per-member
 * phone/email) is deferred to a separate "México ficha del hogar" feature — see plan.md
 * "Household roster" (T003a Option A). 015 captures respondent-level data only.
 */
import type { InlineKeyboardButton } from '@/types/telegram'
import type { SurveyQuestion } from '@/lib/conversation/survey-questions'
import { PREGNANCY_BABY_QUESTIONS } from '@/lib/conversation/survey-questions'
import { computeMexicoNse } from '@/lib/scoring/mexico-nse'
import { lookupMexicoNseRegion, MEXICO_REGIONS } from '@/lib/geo/mexico-nse-catalog'
import type { CountryConfig, GeoHierarchy } from './types'

const CONFLICT_OF_INTEREST_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'conflictOfInterest',
  text: 'Muchas gracias por su interés en participar de nuestro proyecto.\n\n¿Usted o algún integrante de su hogar trabaja en: agencia de publicidad, empresa de investigación de mercado, radio/periódico/TV, o es propietario de industria o comercio de alimentos, bebidas, higiene personal, limpieza del hogar, ropa o zapatos?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Sí', callback_data: 'conflictOfInterest:true' },
      { text: 'No', callback_data: 'conflictOfInterest:false' },
    ],
  ],
}

const EDUCATION_HOH_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'educationHoh',
  text: '📋💚 Las siguientes preguntas son solo para segmentar el hogar. 🔒 Tus datos están seguros.\n\nPensando en el jefe o jefa de hogar, ¿cuál fue el último año de estudios que aprobó en la escuela?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Sin instrucción escolar', callback_data: 'educationHoh:Sin instrucción escolar' },
      { text: 'Alfabetizado (sin escuela)', callback_data: 'educationHoh:Alfabetizado sin escuela formal' },
    ],
    [
      { text: 'Primaria incompleta', callback_data: 'educationHoh:Primaria incompleta' },
      { text: 'Primaria completa', callback_data: 'educationHoh:Primaria completa' },
    ],
    [
      { text: 'Secundaria incompleta', callback_data: 'educationHoh:Secundaria incompleta' },
      { text: 'Secundaria completa', callback_data: 'educationHoh:Secundaria completa' },
    ],
    [
      { text: 'Prepa/Bachillerato/Carrera incompleta', callback_data: 'educationHoh:Prepa/Bachillerato/Carrera incompleta' },
      { text: 'Prepa/Bachillerato/Carrera completa', callback_data: 'educationHoh:Prepa/Bachillerato/Carrera completa' },
    ],
    [
      { text: 'Licenciatura incompleta', callback_data: 'educationHoh:Licenciatura incompleta' },
      { text: 'Licenciatura completa', callback_data: 'educationHoh:Licenciatura completa' },
    ],
    [
      { text: 'Posgrado incompleto', callback_data: 'educationHoh:Posgrado incompleto' },
      { text: 'Posgrado completo / Maestría / Doctorado', callback_data: 'educationHoh:Posgrado completo' },
    ],
  ],
}

const FULL_BATHROOMS_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'fullBathrooms',
  text: '¿Cuántos baños completos con regadera y W.C. (excusado) hay en esta vivienda? (0 es un valor válido)',
  inputType: 'button',
  buttons: [
    [
      { text: '0', callback_data: 'fullBathrooms:0' },
      { text: '1', callback_data: 'fullBathrooms:1' },
      { text: '2 o más', callback_data: 'fullBathrooms:2 o más' },
    ],
  ],
}

const VEHICLE_COUNT_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'vehicleCount',
  text: '¿Cuántos automóviles o camionetas tienen en su hogar, incluyendo camionetas cerradas, o con cabina o caja? (0 es un valor válido)',
  inputType: 'button',
  buttons: [
    [
      { text: '0', callback_data: 'vehicleCount:0' },
      { text: '1', callback_data: 'vehicleCount:1' },
      { text: '2 o más', callback_data: 'vehicleCount:2 o más' },
    ],
  ],
}

const HOME_INTERNET_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'homeInternet',
  text: 'Sin tomar en cuenta la conexión móvil que pudiera tener desde algún celular, ¿este hogar cuenta con internet?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Sí tiene', callback_data: 'homeInternet:Sí tiene' },
      { text: 'No tiene', callback_data: 'homeInternet:No tiene' },
    ],
  ],
}

const WORKERS_14_PLUS_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'workers14Plus',
  text: 'De todas las personas de 14 años o más que viven en el hogar, ¿cuántas trabajaron en el último mes?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Nadie', callback_data: 'workers14Plus:0' },
      { text: '1', callback_data: 'workers14Plus:1' },
      { text: '2', callback_data: 'workers14Plus:2' },
    ],
    [
      { text: '3', callback_data: 'workers14Plus:3' },
      { text: '4 o más', callback_data: 'workers14Plus:4 o más' },
    ],
  ],
}

const BEDROOMS_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'bedrooms',
  text: 'En esta vivienda, ¿cuántos cuartos se usan para dormir, sin contar pasillos ni baños? (Si son más de 6, escribe el número; 0 es válido)',
  inputType: 'button',
  buttons: [
    [
      { text: '0', callback_data: 'bedrooms:0' },
      { text: '1', callback_data: 'bedrooms:1' },
      { text: '2', callback_data: 'bedrooms:2' },
      { text: '3', callback_data: 'bedrooms:3' },
    ],
    [
      { text: '4', callback_data: 'bedrooms:4' },
      { text: '5', callback_data: 'bedrooms:5' },
      { text: '6', callback_data: 'bedrooms:6' },
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

const CODIGO_POSTAL_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'codigoPostal',
  text: '¿Cuál es tu código postal? (5 dígitos)',
  inputType: 'free_text',
}

/**
 * Order: screening first, then the 6 AMAI NSE variables, household size, pregnancy/baby,
 * and the México-only Código Postal (geo fallback — not a scoring variable).
 */
const MEXICO_SCORING_QUESTIONS: SurveyQuestion[] = [
  CONFLICT_OF_INTEREST_QUESTION,
  EDUCATION_HOH_QUESTION,
  FULL_BATHROOMS_QUESTION,
  VEHICLE_COUNT_QUESTION,
  HOME_INTERNET_QUESTION,
  WORKERS_14_PLUS_QUESTION,
  BEDROOMS_QUESTION,
  HOUSEHOLD_SIZE_QUESTION,
  ...PREGNANCY_BABY_QUESTIONS,
  CODIGO_POSTAL_QUESTION,
]

const MEXICO_GEO_HIERARCHY: GeoHierarchy = {
  stateProvinceLabel: 'estado',
  municipalityLabel: 'municipio o alcaldía',
  neighborhoodLabel: 'colonia',
}

const MEXICO_SCREENING_INDUSTRIES: InlineKeyboardButton[][] = CONFLICT_OF_INTEREST_QUESTION.buttons!

function mexicoValidatePhone(raw: string): { ok: boolean; normalized: string | null } {
  let digits = raw.replace(/\D/g, '')
  // Drop a leading 52 country code, then a "1" immediately after it (the old
  // Mexican-mobile 1-prefix), then a single leading 0.
  if (digits.startsWith('52')) {
    digits = digits.slice(2)
    if (digits.startsWith('1')) digits = digits.slice(1)
  }
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length !== 10) return { ok: false, normalized: null }
  // E.164, matching leads.phoneNumber's stored shape everywhere else (+<digits>).
  return { ok: true, normalized: `+52${digits}` }
}

export const mexicoConfig: CountryConfig = {
  country: 'México',
  nseLevels: ['AB', 'C+', 'C', 'D+', 'D/E'],
  geoHierarchy: MEXICO_GEO_HIERARCHY,
  scoringQuestions: MEXICO_SCORING_QUESTIONS,
  screeningIndustries: MEXICO_SCREENING_INDUSTRIES,
  computeNse: (answers) => {
    const result = computeMexicoNse(answers as Parameters<typeof computeMexicoNse>[0])
    return { points: result.points, level: result.level }
  },
  resolveNseRegion: (geo) => lookupMexicoNseRegion(geo.stateProvince, geo.municipality),
  validatePhone: mexicoValidatePhone,
  listNseRegions: () => MEXICO_REGIONS,
}
