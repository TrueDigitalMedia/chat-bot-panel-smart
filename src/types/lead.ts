import type { Channel } from './channel'

export type LeadStatus =
  | 'incomplete'
  | 'not_qualified'
  | 'quota_exhausted'
  | 'link_sent'
  | 'waiting_for_code'
  | 'code_delivered_registered'
  | 'code_delivered_not_registered'
  | 'code_delivered_no_response'
  | 'ficha_hogar_completada'
  | 'ficha_hogar_descartado'
  | 'abandono'

export type DecisionPoint = 'd1' | 'd2' | 'd3'

export interface Lead {
  id: string
  channel: Channel
  channelUserId: string
  channelUsername: string | null
  phoneNumber: string | null
  leadStatus: LeadStatus
  currentPhase: number
  surveyQuestionIndex: number
  quotaSegment: string | null
  quotaMatchedDimension: string | null
  quotaMatchedValue: string | null
  score: number | null
  optInAccepted: boolean
  d1Accepted: boolean
  reEngagementConsentAccepted: boolean | null
  d2Accepted: boolean | null
  d3IsShopper: boolean | null
  conversationSummary: string | null
  reEngagementCount: number
  lastActivityAt: Date
  createdAt: Date
  updatedAt: Date
  tdmLeadId: number | null
  tdmSyncStatus: string | null
  tdmLastSyncAt: Date | null
  tdmRegistrationRequestedAt: Date | null
  tdmRegistrationCode: string | null
  panelSmartSyncStatus: string | null
  panelSmartLastSyncAt: Date | null
  panelSmartSyncedAnswersJson: Record<string, unknown> | null
}

export interface SurveyProfile {
  id: string
  leadId: string
  fullName: string | null
  country: string | null
  stateProvince: string | null
  municipality: string | null
  neighborhood: string | null
  nseRegion: string | null
  email: string | null
  gender: string | null
  educationPsh: string | null
  cars: string | null
  domesticHelp: boolean | null
  householdSize: number | null
  bedrooms: number | null
  shoppingFrequency: string | null
  shoppingCategories: number[] | null
  contactChannel: string | null
  contactSchedule: string | null
  rawFreeTextJson: Record<string, unknown> | null
  extractionModel: string | null
  completedAt: Date | null
  age: number | null
  isPregnant: boolean | null
  hasBabyUnder3: boolean | null
}

// Scoring fields subset
export type ScoringFields = Pick<
  SurveyProfile,
  'educationPsh' | 'cars' | 'domesticHelp' | 'householdSize' | 'bedrooms'
>

// Survey question field names in order — must match SURVEY_QUESTIONS in
// survey-questions.ts exactly (age/isPregnant/hasBabyUnder3 moved to match the actual
// Excel question order: age right after gender, isPregnant/hasBabyUnder3 right after
// householdSize — see tests/unit/survey-question-count.test.ts).
export const SURVEY_FIELDS = [
  'fullName',
  'country',
  'stateProvince',
  'municipality',
  'neighborhood',
  'email',
  'gender',
  'age',
  'educationPsh',
  'cars',
  'domesticHelp',
  'householdSize',
  'isPregnant',
  'hasBabyUnder3',
  'bedrooms',
  'shoppingFrequency',
  'shoppingCategories',
  'contactChannel',
  'contactSchedule',
] as const satisfies (keyof SurveyProfile)[]

export type SurveyFieldName = (typeof SURVEY_FIELDS)[number]

// Which survey fields use button callbacks vs free text
export const BUTTON_FIELDS = new Set<SurveyFieldName>([
  'country',
  'gender',
  'educationPsh',
  'cars',
  'domesticHelp',
  'shoppingFrequency',
  'contactChannel',
  'contactSchedule',
  'isPregnant',
  'hasBabyUnder3',
])

export const FREE_TEXT_FIELDS = new Set<SurveyFieldName>([
  'fullName',
  'stateProvince',
  'municipality',
  'neighborhood',
  'email',
  'householdSize',
  'bedrooms',
  'shoppingCategories',
  'age',
])

// --- Ficha Hogar (Fase 4, spec 008) — separate questionnaire, separate table ---

export interface FichaHogarProfile {
  id: string
  leadId: string
  questionIndex: number
  conflictOfInterest: boolean | null
  hasInternet: boolean | null
  relationshipToHoh: string | null
  dateOfBirth: string | null
  hasHealthCondition: boolean | null
  unlimitedDataPlan: boolean | null
  petCount: number | null
  completedAt: Date | null
  createdAt: Date
}

// Ficha Hogar question field names in order
export const FICHA_HOGAR_FIELDS = [
  'conflictOfInterest',
  'hasInternet',
  'relationshipToHoh',
  'dateOfBirth',
  'hasHealthCondition',
  'unlimitedDataPlan',
  'petCount',
] as const satisfies (keyof FichaHogarProfile)[]

export type FichaHogarFieldName = (typeof FICHA_HOGAR_FIELDS)[number]

export const FICHA_HOGAR_BUTTON_FIELDS = new Set<FichaHogarFieldName>([
  'conflictOfInterest',
  'hasInternet',
  'relationshipToHoh',
  'hasHealthCondition',
  'unlimitedDataPlan',
])

export const FICHA_HOGAR_FREE_TEXT_FIELDS = new Set<FichaHogarFieldName>(['dateOfBirth', 'petCount'])
