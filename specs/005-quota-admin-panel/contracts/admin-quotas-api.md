# Contract: `/api/admin/quotas*`

All routes require `Authorization: Basic <base64(admin:ADMIN_PASSWORD)>` (enforced by `src/middleware.ts`, not repeated per-route). Missing/invalid credentials → `401` with `WWW-Authenticate: Basic realm="admin"`, no body.

## `GET /api/admin/quotas`

Lists all quota targets with computed progress (`QuotaProgress`, see data-model.md).

**Query params** (all optional): `country`, `region`, `nseLevel`, `active` (`true`/`false`).

**Response `200`**:
```json
{
  "items": [
    {
      "id": "uuid",
      "country": "Guatemala",
      "region": "Sur Occidente Chico",
      "nseLevel": "Nivel 2",
      "target": 50,
      "achieved": 4,
      "available": 46,
      "active": true,
      "progressPct": 8,
      "notes": null,
      "updatedAt": "2026-07-18T00:00:00.000Z"
    }
  ],
  "summary": { "totalTarget": 3494, "totalAchieved": 159, "totalAvailable": 3335 }
}
```

## `POST /api/admin/quotas`

Creates a new quota target. Body:
```json
{ "country": "Guatemala", "region": "Sur Occidente Chico", "nseLevel": "Nivel 2", "targetCount": 50, "notes": null }
```

- `country`/`region`/`nseLevel` MUST be one of the closed catalog values (see research.md R3) — `400` with `{ "error": "invalid_region", "validRegions": [...] }` otherwise.
- `region` MUST belong to `country` per `listNseRegionsForCountry(country)` — `400` if mismatched.
- Violates the `(country, region, nseLevel)` unique constraint → `409` (use `PUT` to edit an existing row instead).

**Response `201`**: the created row (same shape as a `GET` item, `achieved`/`available`/`progressPct` computed as if 0 leads yet).

## `PUT /api/admin/quotas/[id]`

Updates `targetCount`, `active`, and/or `notes` on an existing row. Body: any subset of `{ "targetCount": number, "active": boolean, "notes": string | null }`.

- `404` if `id` doesn't exist.
- `targetCount < 0` → `400`.
- Always bumps `updatedAt`.

**Response `200`**: the updated row (same shape as a `GET` item).

## `POST /api/admin/quotas/import`

`multipart/form-data`, field `file`: an `.xlsx` workbook shaped like `docs/Kantar Quotas Test.xlsx`'s `CAM` sheet (region rows formatted `"<País> - <Región>"`, followed by Objetivo/Conseguidos/Disponibles triplets per NSE level — see research.md R1 for the exact layout discovered by inspection).

For each parsed row: normalize country (`canonicalCountry`, including the `RD` alias added per research.md R2) and match region against `listNseRegionsForCountry`. Matched rows are upserted (`ON CONFLICT (country, region, nse_level) DO UPDATE SET target_count = excluded.target_count, updated_at = now()`). Unmatched rows are **not** written.

**Response `200`**:
```json
{
  "imported": 132,
  "unmatched": [
    { "row": "Xxxx - Yyyy", "reason": "country_not_recognized" }
  ]
}
```

- Non-`.xlsx` file or unparseable workbook → `400`.
- Missing `CAM` sheet → `400`.

## `GET /api/admin/quotas/export`

No params. Streams an `.xlsx` file (`Content-Disposition: attachment; filename="quota-targets-<date>.xlsx"`) with one sheet, shaped like the import format, populated from current `QuotaTarget` + computed `achieved`/`available` — i.e. round-trip compatible with `POST .../import`.

**Response `200`**: binary `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## Internal (not HTTP): `checkQuotaAvailability`

Not a route — documented here because its contract changes as part of this feature. See data-model.md § "Cambio de contrato en función existente".
