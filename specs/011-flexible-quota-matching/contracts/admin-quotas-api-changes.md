# Contract changes: `/api/admin/quotas*` (spec 005 → this feature)

Extends the contract in `specs/005-quota-admin-panel/contracts/admin-quotas-api.md`. Auth model (Basic Auth via `src/middleware.ts`) is unchanged. Only the diffs are documented here.

## `GET /api/admin/quotas`

**Query params**: adds optional `dimensionType` (`nse | edad | integrantes`) alongside the existing `country`, `region`, `active`. `nseLevel` param is renamed `dimensionValue` (works for any dimension type, not just NSE).

**Response item shape**: `nseLevel` → `dimensionType` + `dimensionValue`:
```json
{
  "id": "uuid",
  "country": "Honduras",
  "region": "Nor Occidente I",
  "dimensionType": "integrantes",
  "dimensionValue": "5+",
  "target": 22,
  "achieved": 0,
  "available": 22,
  "active": true,
  "progressPct": 0,
  "notes": null,
  "updatedAt": "2026-07-20T00:00:00.000Z"
}
```

## `POST /api/admin/quotas`

Body adds `dimensionType`; `nseLevel` renamed `dimensionValue`:
```json
{ "country": "Honduras", "region": "Nor Occidente I", "dimensionType": "integrantes", "dimensionValue": "5+", "targetCount": 22, "notes": null }
```

- `dimensionValue` MUST be valid for the given `dimensionType` per the catalog in data-model.md — `400` with `{ "error": "invalid_dimension_value", "validValues": [...] }` otherwise.
- Conflict on `(country, region, dimensionType, dimensionValue)` → `409` (unchanged behavior, new key).

## `PUT /api/admin/quotas/[id]` — unchanged

Still patches `{ targetCount, active, notes }` on an existing row by `id`. No new fields (the dimension identity of a row is immutable — delete/recreate instead of retyping).

## New: `GET /api/admin/quotas/region-caps`

Lists all `quota_region_caps` rows with computed `achieved` (all `QUALIFIED_STATUSES` leads for that country+region, any dimension, including exception-qualified).

**Response `200`**:
```json
{
  "items": [
    { "id": "uuid", "country": "Honduras", "region": "Nor Occidente I", "capCount": 120, "achieved": 34, "notes": null, "updatedAt": "..." }
  ]
}
```

## New: `POST /api/admin/quotas/region-caps`

Creates a region cap. Body: `{ "country": "Honduras", "region": "Nor Occidente I", "capCount": 120, "notes": null }`. `capCount` may be `null` (explicitly "no cap"). Same country/region validation as `quota_targets`. Conflict on `(country, region)` → `409`.

## New: `PUT /api/admin/quotas/region-caps/[id]`

Patches `{ capCount, notes }` on an existing region cap row. `404` if missing.

## `POST /api/admin/quotas/import` / `GET /api/admin/quotas/export`

Layout changes from the old Objetivo/Conseguidos/Disponibles-per-NSE-level sheet to the new per-country sheet layout already used in `docs/Muestra Faltante por País Julio 2026_True.xlsx` (one sheet per country; rows = region; columns = `SCL1..SCL4 | Embarazadas y bebés Hasta 36m (ignored — not a configurable target) | Hasta 34 | 35 a 49 | 50+ | 1 a 2 | 3 a 4 | 5+`). Each non-empty cell upserts one `quota_targets` row with the corresponding `dimensionType`/`dimensionValue`. `SCL{n}` header values are translated to `Nivel {n}` on import (research.md R6). The "Embarazadas y bebés" column has no target — it is not imported as a `quota_targets` row (the exception is unconditional, not quota-bound).

Region caps are **not** part of this import format (they're the new manual-only concept from `/speckit-specify`) — managed only via the `region-caps` endpoints above or directly in the admin UI.
