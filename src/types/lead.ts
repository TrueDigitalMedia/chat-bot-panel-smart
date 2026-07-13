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
  score: number | null
  d1Accepted: boolean
  d2Accepted: boolean | null
  d3IsShopper: boolean | null
  conversationSummary: string | null
  reEngagementCount: number
  lastActivityAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface SurveyProfile {
  id: string
  leadId: string
  fullName: string | null
  country: string | null
  stateProvince: string | null
  municipality: string | null
  neighborhood: string | null
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
}

// Scoring fields subset
export type ScoringFields = Pick<
  SurveyProfile,
  'educationPsh' | 'cars' | 'domesticHelp' | 'householdSize' | 'bedrooms'
>

// Survey question field names in order
export const SURVEY_FIELDS = [
  'fullName',
  'country',
  'stateProvince',
  'municipality',
  'neighborhood',
  'email',
  'gender',
  'educationPsh',
  'cars',
  'domesticHelp',
  'householdSize',
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
])
