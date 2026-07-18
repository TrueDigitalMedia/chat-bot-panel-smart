import { NextRequest, NextResponse } from 'next/server'
import {
  updateQuotaTarget,
  QuotaTargetError,
  QuotaTargetNotFoundError,
} from '@/lib/quotas/quota-targets'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json()

  try {
    const row = await updateQuotaTarget(id, {
      ...(body.targetCount !== undefined ? { targetCount: body.targetCount } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    })
    return NextResponse.json(row)
  } catch (err) {
    if (err instanceof QuotaTargetError) {
      return NextResponse.json({ error: err.code }, { status: 400 })
    }
    if (err instanceof QuotaTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    throw err
  }
}
