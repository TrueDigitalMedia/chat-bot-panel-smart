import { NextRequest, NextResponse } from 'next/server'
import { evaluateLeadManually, getLatestEvalForLead } from '@/lib/eval/persist-eval'

/** POST — run (or re-run) Phase-1 qualification/quota eval for this conversation. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const out = await evaluateLeadManually(id)

  if ('skipped' in out && out.skipped) {
    return NextResponse.json(
      { error: 'not_evaluable', skipReason: out.skipReason, leadId: id },
      { status: 422 },
    )
  }

  const latest = await getLatestEvalForLead(id)
  return NextResponse.json({
    leadId: out.leadId,
    reason: out.reason,
    overallScore: out.result.overallScore,
    passed: out.result.passed,
    checks: out.result.checks,
    mismatches: out.result.mismatches,
    eval: latest,
  })
}
