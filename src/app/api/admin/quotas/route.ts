import { NextRequest, NextResponse } from 'next/server'
import { listQuotaProgress } from '@/lib/quotas/quota-progress'
import { createQuotaTarget, QuotaTargetConflictError, QuotaTargetError } from '@/lib/quotas/quota-targets'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const country = searchParams.get('country') ?? undefined
  const region = searchParams.get('region') ?? undefined
  const nseLevel = searchParams.get('nseLevel') ?? undefined
  const activeParam = searchParams.get('active')
  const active = activeParam == null ? undefined : activeParam === 'true'

  const items = await listQuotaProgress({ country, region, nseLevel, active })

  const summary = items.reduce(
    (acc, item) => {
      acc.totalTarget += item.target
      acc.totalAchieved += item.achieved
      acc.totalAvailable += item.available
      return acc
    },
    { totalTarget: 0, totalAchieved: 0, totalAvailable: 0 },
  )

  return NextResponse.json({ items, summary })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

  try {
    const row = await createQuotaTarget({
      country: body.country,
      region: body.region,
      nseLevel: body.nseLevel,
      targetCount: body.targetCount,
      notes: body.notes ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    if (err instanceof QuotaTargetError) {
      return NextResponse.json(
        { error: err.code, ...(err.validRegions ? { validRegions: err.validRegions } : {}) },
        { status: 400 },
      )
    }
    if (err instanceof QuotaTargetConflictError) {
      return NextResponse.json({ error: 'conflict', message: err.message }, { status: 409 })
    }
    throw err
  }
}
