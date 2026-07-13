import { NextRequest, NextResponse } from 'next/server'
import { transitionLead } from '@/lib/state-machine'
import { generateCorrelationId } from '@/lib/correlation'
import { getLeadById } from '@/lib/db/leads'
import type { LeadStatus } from '@/types/lead'

interface StatusUpdateBody {
  new_status: LeadStatus
  reason: string
  metadata?: Record<string, unknown>
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json()) as StatusUpdateBody
  const correlationId = generateCorrelationId()

  try {
    const result = await transitionLead(id, body.new_status, body.reason, correlationId)
    return NextResponse.json({ id, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transition failed'
    if (message.includes('Invalid transition')) {
      return NextResponse.json({ error: 'invalid_transition', detail: message }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
