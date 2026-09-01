import type { DecisionPoint } from './lead'

export type PhaseNumber = 1 | 2 | 3 | 4

export interface FlowState {
  id: string
  leadId: string
  currentPhase: PhaseNumber
  decisionPoint: DecisionPoint | null
  surveyQuestionIndex: number
  isInFaqDigression: boolean
  digressionResumeIndex: number | null
  updatedAt: Date
}

export interface ReEngagementSchedule {
  id: string
  leadId: string
  phase: PhaseNumber
  attemptNumber: number
  scheduledAt: Date
  deliveredAt: Date | null
  outcome: 'responded' | 'no_response' | 'cancelled' | null
  qstashMessageId: string | null
}
