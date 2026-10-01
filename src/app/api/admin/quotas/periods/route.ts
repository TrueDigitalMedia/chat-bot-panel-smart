import { NextRequest, NextResponse } from 'next/server'
import { openQuotaPeriod, type QuotaPeriodStatus } from '@/lib/quotas/quota-periods'
import { listQuotaPeriodsWithProgress } from '@/lib/quotas/quota-cuts'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status')
  const status =
    statusParam === 'open' || statusParam === 'closed' ? (statusParam as QuotaPeriodStatus) : undefined

  const items = await listQuotaPeriodsWithProgress({
    country: searchParams.get('country') ?? undefined,
    status,
  })
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

  try {
    const row = await openQuotaPeriod({
      country: body.country,
      quarter: Number(body.quarter),
      year: Number(body.year),
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      label: body.label || undefined,
      notes: body.notes ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
