import { NextRequest, NextResponse } from 'next/server'
import { getConversationDetail } from '@/lib/db/conversation-messages'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const detail = await getConversationDetail(id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail)
}
