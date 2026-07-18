import { NextRequest, NextResponse } from 'next/server'
import { importQuotaTargetsFromWorkbook } from '@/lib/quotas/excel-import'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ error: 'file must be an .xlsx workbook' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const result = await importQuotaTargetsFromWorkbook(buffer)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not parse workbook' },
      { status: 400 },
    )
  }
}
