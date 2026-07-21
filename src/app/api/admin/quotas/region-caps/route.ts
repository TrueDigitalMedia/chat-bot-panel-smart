import { NextRequest, NextResponse } from 'next/server'
import { createRegionCap, listRegionCaps, RegionCapConflictError } from '@/lib/quotas/region-caps'
import { QuotaTargetError } from '@/lib/quotas/quota-targets'

export async function GET(): Promise<NextResponse> {
  const items = await listRegionCaps()
  return NextResponse.json({ items })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

  try {
    const row = await createRegionCap({
      country: body.country,
      region: body.region,
      capCount: body.capCount ?? null,
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
    if (err instanceof RegionCapConflictError) {
      return NextResponse.json({ error: 'conflict', message: err.message }, { status: 409 })
    }
    throw err
  }
}
