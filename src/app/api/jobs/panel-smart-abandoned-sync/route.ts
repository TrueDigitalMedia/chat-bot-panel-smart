import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { sweepPendingLeads } from '@/lib/panel-smart/sweep'

/**
 * QStash recurring schedule (every 3 hours, configured via upstash CLI or API):
 * flushes Panel Smart sync for conversations that went quiet for 1h+ without finishing
 * a phase — the normal sync hooks (transitionLead, correction commits) only fire on those
 * specific events, so a lead that stalls mid-phase would otherwise sit with unsynced
 * answers indefinitely.
 *
 * Auth: QStash signs requests with `Authorization: Bearer $CRON_SECRET`, and the schedule
 * is set up once via `upstash qstash schedule create`. See ./QSTASH_SETUP.md for instructions.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sweepPendingLeads('abandoned_cron', true)
  return NextResponse.json(result)
}
