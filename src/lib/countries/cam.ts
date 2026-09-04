/**
 * CountryConfig for the 7 CAM/RD markets (Guatemala, Honduras, El Salvador, Nicaragua,
 * Costa Rica, Rep. Dominicana, Panamá). Wraps the existing SCL-CAM implementation
 * unchanged — no behavior change for these countries (constitution FR-016 / Principle V).
 */
import type { InlineKeyboardButton } from '@/types/telegram'
import type { SurveyQuestion } from '@/lib/conversation/survey-questions'
import { PREGNANCY_BABY_QUESTIONS } from '@/lib/conversation/survey-questions'
import { calculateScore, getQuotaSegment } from '@/lib/scoring/socioeconomic'
import { lookupNseRegion } from '@/lib/geo/cam-nse-catalog'
import type { CountryConfig, GeoHierarchy, NseResult } from './types'

const EDUCATION_PSH_QUESTION: SurveyQuestion = {
  index: 0,
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
}

const CARS_QUESTION: SurveyQuestion = {
  index: 0,
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
}

const DOMESTIC_HELP_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'domesticHelp',
  text: '¿Este hogar cuenta actualmente con apoyo de servicio doméstico?',
  inputType: 'button',
  buttons: [
    [
      { text: 'Sí', callback_data: 'domesticHelp:true' },
      { text: 'No', callback_data: 'domesticHelp:false' },
    ],
  ],
}

const HOUSEHOLD_SIZE_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'householdSize',
  text: '¿Cuántas personas residen habitualmente en este hogar? (Si son más de 6, escribe el número)',
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

const BEDROOMS_QUESTION: SurveyQuestion = {
  index: 0,
  fieldName: 'bedrooms',
  text: '¿Cuántas habitaciones destinadas exclusivamente para dormir tiene este hogar? (Si son más de 6, escribe el número)',
  inputType: 'button',
  buttons: [
    [
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

/**
 * Order matters: concatenated after SHARED_PREFIX (8) and before SHARED_SUFFIX, this
 * reproduces the pre-014 fixed SURVEY_QUESTIONS order exactly (Q9-Q15) — see
 * tests/unit/country-config-registry.test.ts.
 */
const CAM_SCORING_QUESTIONS: SurveyQuestion[] = [
  EDUCATION_PSH_QUESTION,
  CARS_QUESTION,
  DOMESTIC_HELP_QUESTION,
  HOUSEHOLD_SIZE_QUESTION,
  ...PREGNANCY_BABY_QUESTIONS,
  BEDROOMS_QUESTION,
]

const CAM_GEO_HIERARCHY: GeoHierarchy = {
  stateProvinceLabel: 'provincia/departamento',
  municipalityLabel: 'municipio',
  neighborhoodLabel: null, // Q5 (neighborhood) stays hidden for every CAM/RD country
}

function camComputeNse(answers: Record<string, unknown>): NseResult {
  const score = calculateScore({
    educationPsh: (answers.educationPsh as string | null) ?? null,
    cars: (answers.cars as string | null) ?? null,
    domesticHelp: (answers.domesticHelp as boolean | null) ?? null,
    householdSize: (answers.householdSize as number | null) ?? null,
    bedrooms: (answers.bedrooms as number | null) ?? null,
  })
  return { points: score, level: getQuotaSegment(score) }
}

function camValidatePhone(raw: string): { ok: boolean; normalized: string | null } {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 8 ? { ok: true, normalized: digits } : { ok: false, normalized: null }
}

/** No Phase-1 sensitive-industry screening exists for CAM today — unchanged. */
const CAM_SCREENING_INDUSTRIES: InlineKeyboardButton[][] = []

/**
 * Costa Rica calls its second administrative division "cantón", not "municipio", and
 * Guatemala's first-division question names the country explicitly — the two pieces of
 * CAM geo wording that varied per country (previously special-cased inline in
 * send-survey-question.ts / guatemala.ts's guatemalaQuestionText).
 */
const COSTA_RICA_GEO_HIERARCHY: GeoHierarchy = {
  ...CAM_GEO_HIERARCHY,
  municipalityLabel: 'municipio o cantón',
}
const GUATEMALA_GEO_HIERARCHY: GeoHierarchy = {
  ...CAM_GEO_HIERARCHY,
  stateProvinceLabel: 'departamento de Guatemala',
}

/**
 * One CountryConfig per CAM/RD country name, all sharing the same scoring/questions/phone
 * logic — only `country` (closed over for resolveNseRegion) and, for Costa Rica, the geo
 * wording differ. `makeCamConfig` is called once per name in registry.ts; it is not a
 * country-name branch itself (constitution Principle V) — it's a config factory, same
 * shape for every input.
 */
export function makeCamConfig(country: string): CountryConfig {
  return {
    country,
    nseLevels: ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'],
    geoHierarchy:
      country === 'Costa Rica'
        ? COSTA_RICA_GEO_HIERARCHY
        : country === 'Guatemala'
          ? GUATEMALA_GEO_HIERARCHY
          : CAM_GEO_HIERARCHY,
    scoringQuestions: CAM_SCORING_QUESTIONS,
    screeningIndustries: CAM_SCREENING_INDUSTRIES,
    computeNse: camComputeNse,
    resolveNseRegion: (geo) => lookupNseRegion(country, geo.stateProvince ?? '', geo.municipality ?? ''),
    validatePhone: camValidatePhone,
  }
}
