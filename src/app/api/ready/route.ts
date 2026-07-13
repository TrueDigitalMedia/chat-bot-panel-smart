import { NextResponse } from 'next/server'
import { sql } from '@/lib/db/client'

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, boolean> = {}

  // DB check
  try {
    await sql`SELECT 1`
    checks.db = true
  } catch {
    checks.db = false
  }

  // Env vars check
  const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY', 'QSTASH_TOKEN', 'POSTGRES_URL']
  checks.env = requiredEnv.every((k) => !!process.env[k])

  const allReady = Object.values(checks).every(Boolean)
  return NextResponse.json({ ready: allReady, checks }, { status: allReady ? 200 : 503 })
}
