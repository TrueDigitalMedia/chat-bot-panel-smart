import { NextResponse } from 'next/server'
import { closeQuotaPeriod } from '@/lib/quotas/quota-cuts'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

/**
 * Cierra el periodo y congela el corte. Idempotente: sobre uno ya cerrado devuelve el corte
 * guardado con `alreadyClosed: true`.
 *
 * POST y no PATCH porque es un comando, no un update de campos.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  try {
    const result = await closeQuotaPeriod(id)
    return NextResponse.json(result)
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
