import { NextResponse } from 'next/server'
import { reopenQuotaPeriod } from '@/lib/quotas/quota-cuts'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

/** Reabre un periodo cerrado y BORRA su corte (es un valor derivado — ver reopenQuotaPeriod). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  try {
    const period = await reopenQuotaPeriod(id)
    return NextResponse.json({ period })
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
