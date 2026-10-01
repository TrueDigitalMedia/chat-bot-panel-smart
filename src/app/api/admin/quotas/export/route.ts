import { NextRequest, NextResponse } from 'next/server'
import { exportQuotaTargetsToWorkbook } from '@/lib/quotas/excel-export'
import { getQuotaPeriod } from '@/lib/quotas/quota-periods'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const periodId = new URL(request.url).searchParams.get('periodId') ?? undefined
  const buffer = await exportQuotaTargetsToWorkbook({ periodId })

  // El label del periodo en el nombre del archivo: sin esto, dos exports de trimestres distintos
  // son archivos indistinguibles en la carpeta de descargas.
  const period = periodId ? await getQuotaPeriod(periodId) : null
  const suffix = period
    ? `${period.country}-${period.label}`.replace(/[^\w.-]+/g, '-')
    : new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="quota-targets-${suffix}.xlsx"`,
    },
  })
}
