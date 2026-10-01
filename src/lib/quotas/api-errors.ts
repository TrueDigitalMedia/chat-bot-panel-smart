import { NextResponse } from 'next/server'
import {
  QuotaTargetConflictError,
  QuotaTargetError,
  QuotaTargetNotFoundError,
} from '@/lib/quotas/quota-targets'
import { QuotaPeriodError, QuotaPeriodNotFoundError } from '@/lib/quotas/quota-periods'
import { RegionCapConflictError, RegionCapNotFoundError } from '@/lib/quotas/region-caps'

/**
 * Mapeo dominio → HTTP de las rutas /api/admin/quotas/*.
 *
 * Centralizado (y no repetido en cada ruta, como estaba) porque con los periodos pasaron a ser
 * seis rutas aplicando el mismo mapeo, y dos de los códigos nuevos — `period_closed` y
 * `period_already_open` — son 409 y no 400: un 400 haría que el panel mostrara "datos
 * inválidos" cuando en realidad el problema es el estado del periodo.
 */
const CONFLICT_CODES = new Set(['period_closed', 'period_already_open', 'duplicate_label', 'period_not_closed'])

/** Devuelve la respuesta de error, o null si el error no es de este dominio (hay que re-lanzarlo). */
export function quotaErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof QuotaTargetError) {
    return NextResponse.json(
      {
        error: err.code,
        message: err.message,
        ...(err.validRegions ? { validRegions: err.validRegions } : {}),
        ...(err.validValues ? { validValues: err.validValues } : {}),
      },
      { status: CONFLICT_CODES.has(err.code) ? 409 : 400 },
    )
  }
  if (err instanceof QuotaPeriodError) {
    return NextResponse.json(
      {
        error: err.code,
        message: err.message,
        ...(err.openPeriodId ? { openPeriodId: err.openPeriodId } : {}),
      },
      { status: CONFLICT_CODES.has(err.code) ? 409 : 400 },
    )
  }
  if (err instanceof QuotaTargetConflictError || err instanceof RegionCapConflictError) {
    return NextResponse.json({ error: 'conflict', message: err.message }, { status: 409 })
  }
  if (
    err instanceof QuotaTargetNotFoundError ||
    err instanceof RegionCapNotFoundError ||
    err instanceof QuotaPeriodNotFoundError
  ) {
    return NextResponse.json({ error: 'not_found', message: err.message }, { status: 404 })
  }
  return null
}
