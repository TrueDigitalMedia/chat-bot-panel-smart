import { logCall } from '@/lib/db/call-log'

// Known prompt injection patterns (case-insensitive)
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /you\s+are\s+now\s+(a\s+)?new\s+(ai|assistant|bot)/i,
  /act\s+as\s+(if\s+you\s+are\s+)?a?\s*(different|new|evil|uncensored)/i,
  /forget\s+(your|all)\s+(instructions?|training)/i,
  /\[system\]/i,
  /<\|im_start\|>/i,
  /###\s*instruction/i,
]

const MAX_INPUT_LENGTH = 500

export class InputRejectedError extends Error {
  constructor(reason: string) {
    super(`Input rejected: ${reason}`)
    this.name = 'InputRejectedError'
  }
}

export async function sanitizeInput(
  text: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<string> {
  // Strip control characters (null bytes, ANSI escapes, etc.)
  let clean = text
    .replace(/\x00/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim()

  // Enforce max length
  if (clean.length > MAX_INPUT_LENGTH) {
    clean = clean.slice(0, MAX_INPUT_LENGTH)
  }

  // Check injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(clean)) {
      if (opts?.correlationId) {
        await logCall({
          leadId: opts.leadId,
          callType: 'input_rejected',
          correlationId: opts.correlationId,
          error: `Injection pattern matched: ${pattern.source}`,
        }).catch(() => {})
      }
      throw new InputRejectedError('potential prompt injection detected')
    }
  }

  return clean
}
