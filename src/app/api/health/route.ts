import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'

export async function GET(): Promise<NextResponse> {
  try {
    await sql`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', db: 'disconnected' }, { status: 503 })
  }
}
