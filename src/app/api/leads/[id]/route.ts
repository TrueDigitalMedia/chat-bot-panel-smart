import { NextRequest, NextResponse } from 'next/server'
import { getLeadById } from '@/lib/db/leads'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: lead.id,
    channel: lead.channel,
    channel_user_id: lead.channelUserId,
    phone_number: lead.phoneNumber,
    lead_status: lead.leadStatus,
    current_phase: lead.currentPhase,
    survey_question_index: lead.surveyQuestionIndex,
    score: lead.score,
    quota_segment: lead.quotaSegment,
    last_activity_at: lead.lastActivityAt,
  })
}
