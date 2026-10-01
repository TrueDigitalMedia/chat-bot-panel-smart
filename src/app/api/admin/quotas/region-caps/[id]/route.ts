import { NextRequest, NextResponse } from 'next/server'
import { updateRegionCap } from '@/lib/quotas/region-caps'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json()

  try {
    const row = await updateRegionCap(id, {
      ...(body.capCount !== undefined ? { capCount: body.capCount } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    })
    return NextResponse.json(row)
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
