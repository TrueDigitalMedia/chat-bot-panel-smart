import { NextResponse } from 'next/server'
import { listConversations } from '@/lib/db/conversation-messages'

export async function GET(): Promise<NextResponse> {
  const { items } = await listConversations({ limit: 100 })
  return NextResponse.json({ conversations: items })
}
