import { NextRequest, NextResponse } from 'next/server'
import { importQuotaTargetsFromWorkbook } from '@/lib/quotas/excel-import'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: 'file must be an .xlsx workbook' }, { status: 400 })
  }

  // Sin `periodId`, cada hoja va al periodo abierto de su país; una hoja cuyo país no tiene
  // periodo abierto vuelve en `unmatched` con reason 'no_open_period'.
  const periodIdRaw = formData.get('periodId')
  const periodId = typeof periodIdRaw === 'string' && periodIdRaw ? periodIdRaw : undefined

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const result = await importQuotaTargetsFromWorkbook(buffer, { periodId })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not parse workbook' },
      { status: 400 },
    )
  }
}
