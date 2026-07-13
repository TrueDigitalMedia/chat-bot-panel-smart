export const PHASE2_CODE_DELAY_SECONDS = 600 // 10 minutes

// Named map keyed by attempt number (1-indexed) to avoid off-by-one errors
export const REENGAGEMENT_DELAY_SECONDS: Record<1 | 2 | 3, number> = {
  1: 4500,   // 75 minutes
  2: 25200,  // 7 hours
  3: 72000,  // 20 hours
}

export const MAX_REENGAGEMENT_ATTEMPTS = 3
