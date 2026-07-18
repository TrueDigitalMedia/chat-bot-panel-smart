import { NextResponse } from 'next/server'
import { exportQuotaTargetsToWorkbook } from '@/lib/quotas/excel-export'

export async function GET(): Promise<NextResponse> {
  const buffer = await exportQuotaTargetsToWorkbook()
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="quota-targets-${date}.xlsx"`,
    },
  })
}
