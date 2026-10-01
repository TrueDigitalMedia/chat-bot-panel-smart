import { NextRequest, NextResponse } from 'next/server'
import { createRegionCap, listRegionCaps } from '@/lib/quotas/region-caps'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const items = await listRegionCaps({
    periodId: searchParams.get('periodId') ?? undefined,
    country: searchParams.get('country') ?? undefined,
  })
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

  try {
    const row = await createRegionCap({
      periodId: body.periodId,
      country: body.country,
      region: body.region,
      capCount: body.capCount ?? null,
      notes: body.notes ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
