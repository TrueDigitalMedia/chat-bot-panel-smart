import { NextRequest, NextResponse } from 'next/server'
import { listQuotaProgress } from '@/lib/quotas/quota-progress'
import { createQuotaTarget } from '@/lib/quotas/quota-targets'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  // Sin `periodId` el alcance es TODO periodo abierto — el comportamiento histórico de esta ruta,
  // que antes de spec 018 no tenía noción de periodo (ver resolvePeriodIds).
  const periodId = searchParams.get('periodId') ?? undefined
  const country = searchParams.get('country') ?? undefined
  const region = searchParams.get('region') ?? undefined
  const dimensionType = searchParams.get('dimensionType') ?? undefined
  const dimensionValue = searchParams.get('dimensionValue') ?? undefined
  const activeParam = searchParams.get('active')
  const active = activeParam == null ? undefined : activeParam === 'true'

  const items = await listQuotaProgress({
    periodId,
    country,
    region,
    dimensionType,
    dimensionValue,
    active,
  })

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
      periodId: body.periodId,
      country: body.country,
      region: body.region,
      dimensionType: body.dimensionType,
      dimensionValue: body.dimensionValue,
      targetCount: body.targetCount,
      notes: body.notes ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
