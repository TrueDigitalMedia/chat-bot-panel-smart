import { NextRequest, NextResponse } from 'next/server'
import { updateQuotaTarget } from '@/lib/quotas/quota-targets'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json()

  try {
    // Un target de un periodo CERRADO no se puede editar — updateQuotaTarget tira
    // 'period_closed', que el mapeo compartido traduce a 409.
    const row = await updateQuotaTarget(id, {
      ...(body.targetCount !== undefined ? { targetCount: body.targetCount } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    })
    return NextResponse.json(row)
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
