import { NextResponse } from 'next/server'
import { getQuotaPeriodOrThrow } from '@/lib/quotas/quota-periods'
import { listCutLeads } from '@/lib/quotas/quota-cuts'
import { quotaErrorResponse } from '@/lib/quotas/api-errors'

const COLUMNS = [
  'lead_id',
  'channel',
  'telefono',
  'lead_status',
  'status_reason',
  'pais',
  'region',
  'nse_lead',
  'dimension_cargada',
  'valor_cargado',
  'creado',
] as const

function csvCell(value: unknown): string {
  if (value == null) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Los leads del corte. `?format=csv` para descargar; por defecto JSON. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const format = new URL(request.url).searchParams.get('format')

  try {
    const period = await getQuotaPeriodOrThrow(id)
    const rows = await listCutLeads(id)

    if (format !== 'csv') {
      return NextResponse.json({ period, items: rows })
    }

    const body = [
      COLUMNS.join(','),
      ...rows.map((r) =>
        [
          r.leadId,
          r.channel,
          r.phoneNumber,
          r.leadStatus,
          r.statusReason,
          r.country,
          r.nseRegion,
          r.quotaSegment,
          r.quotaMatchedDimension,
          r.quotaMatchedValue,
          r.createdAt,
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\n')

    const slug = `${period.country}-${period.label}`.replace(/[^\w.-]+/g, '-')
    return new NextResponse(`﻿${body}`, {
      status: 200,
      headers: {
        // BOM al inicio para que Excel abra el CSV en UTF-8 y no rompa los acentos.
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="corte-leads-${slug}.csv"`,
      },
    })
  } catch (err) {
    const response = quotaErrorResponse(err)
    if (response) return response
    throw err
  }
}
