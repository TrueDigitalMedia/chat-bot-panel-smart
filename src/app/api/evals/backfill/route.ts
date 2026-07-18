import { NextRequest, NextResponse } from 'next/server'
import { backfillPhase1Evals } from '@/lib/eval/persist-eval'

/**
 * POST — backfill Phase-1 evals for existing conversations.
 * Body (optional): { leadIds?: string[], onlyMissing?: boolean }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { leadIds?: string[]; onlyMissing?: boolean } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const summary = await backfillPhase1Evals({
    leadIds: body.leadIds,
    onlyMissing: body.onlyMissing ?? false,
  })

  return NextResponse.json({
    evaluated: summary.evaluated,
    skipped: summary.skipped,
    passed: summary.passed,
    failed: summary.failed,
    results: summary.results.map((r) => {
      if ('skipped' in r && r.skipped) {
        return { leadId: r.leadId, skipped: true as const, skipReason: r.skipReason }
      }
      return {
        leadId: r.leadId,
        skipped: false as const,
        reason: r.reason,
        overallScore: r.result.overallScore,
        passed: r.result.passed,
      }
    }),
  })
}
