# Quickstart Validation Guide: NSE CAM Geo Location Quota

**Feature**: `002-nse-geo-location-quota`  
**Date**: 2026-07-13

Validate GPS gate + NSE allowlist end-to-end. See [contracts/telegram-location.md](contracts/telegram-location.md) and [data-model.md](data-model.md).

---

## Prerequisites

- App running locally with Telegram webhook (ngrok or equivalent) pointing to `/api/webhooks/telegram`
- Migrations applied (includes new `survey_profiles` / `flow_states` geo columns)
- `data/geo/cam-nse-regions.json` present (imported from Excel)
- Env: existing Telegram + DB vars; optional `NOMINATIM_BASE_URL` (defaults to public Nominatim)

**Import catalog** (after placing Excel or using committed JSON):

```bash
# If regenerating from Excel (path may vary):
npx tsx scripts/import-cam-nse-excel.ts "/path/to/Muestra Regiones NSE CAM.xlsx"
npm test -- cam-nse  # unit tests for lookup
```

---

## Scenario A — GPS in catalog (happy path)

1. `/start` → pass D1, D2, D3 → share phone → answer full name.
2. Bot asks to **share location** (before country buttons).
3. Share a GPS point inside an allowlisted municipality (e.g. known Mixco / catalog row for test country).
4. Confirm **Sí** on the summary (país / depto / municipio / barrio).
5. **Expect**: allowlist hit; if barrio was “No identificado”, bot asks only barrio; then survey continues at email (or next non-geo Q). No EXIT_B.
6. Open `/conversations/[id]` → **Expect**: `geoSource = gps_share`, `nseRegion` set, `inQuotaGeo = true`.

---

## Scenario B — GPS outside catalog

1. Reach GPS gate; share location that resolves to a municipality **not** in `cam-nse-regions.json`.
2. Confirm **Sí**.
3. **Expect**: EXIT_B verbatim; `leadStatus = quota_exhausted`; **no** neighborhood question.
4. Monitor → `inQuotaGeo = false`.

---

## Scenario C — Skip GPS / identification fail → manual in catalog

1. At GPS gate, tap **Escribir mi ubicación** (or send non-location text / force geocode failure).
2. Answer country (button) → department → municipality for an **in-catalog** place (use fuzzy confirm if prompted).
3. **Expect**: continue; `geoSource` is `text_exact` or `text_fuzzy`; `nseRegion` set.

---

## Scenario D — Manual out of catalog

1. Skip GPS; enter country + department + municipality **outside** catalog.
2. **Expect**: EXIT_B after municipality resolution; barrio not required; `inQuotaGeo = false`.

---

## Scenario E — Reject GPS confirmation

1. Share GPS that resolves successfully; tap **No, corregir**.
2. **Expect**: full manual country → … flow; proposal discarded.
3. Complete manual in-catalog place → continue with text geo source.

---

## Observability checks

- Logs include correlation/lead id and events: `gps_requested`, `gps_received`, `reverse_geocode_ok|fail`, `gps_confirm_yes|no`, `nse_allowlist_hit|miss` (no lat/lng in DB; avoid logging raw coordinates in production logs if possible — prefer admin names only).
- Health endpoint unchanged; no new required env for smoke if Nominatim default used.

---

## Regression

- Phone capture still runs before name/geo.
- Guatemala fuzzy confirm still works on manual path for GT.
- Phases 2–4 untouched; FAQ / correction flows still function outside GPS gate.
