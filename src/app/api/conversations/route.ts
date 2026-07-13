import { NextResponse } from 'next/server'
import { listConversations } from '@/lib/db/conversation-messages'

export async function GET(): Promise<NextResponse> {
  const conversations = await listConversations(100)
  return NextResponse.json({ conversations })
}
