import { db } from './client'
import { systemCallLogs } from './schema'

interface LogCallParams {
  leadId?: string
  callType: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number
  correlationId: string
  error?: string
}

export async function logCall(params: LogCallParams): Promise<void> {
  await db.insert(systemCallLogs).values({
    leadId: params.leadId,
    callType: params.callType,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    latencyMs: params.latencyMs,
    correlationId: params.correlationId,
    error: params.error,
  })
}
