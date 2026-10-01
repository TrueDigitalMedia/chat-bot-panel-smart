import { NextRequest, NextResponse } from 'next/server'
import { updateQuotaPeriod } from '@/lib/quotas/quota-periods'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

/** Editar fechas/notas. No re-atribuye ningún lead: las fechas son descriptivas (spec 018 §3.3). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json()

  try {
    const row = await updateQuotaPeriod(id, {
      ...(body.startsOn !== undefined ? { startsOn: body.startsOn } : {}),
      ...(body.endsOn !== undefined ? { endsOn: body.endsOn } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    })
    return NextResponse.json(row)
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
