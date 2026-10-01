import { NextResponse } from 'next/server'
import { getPeriodCut } from '@/lib/quotas/quota-cuts'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

/** El corte: congelado si el periodo está cerrado, en vivo (`preliminary: true`) si está abierto. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  try {
    return NextResponse.json(await getPeriodCut(id))
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
