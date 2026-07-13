# Research: NSE CAM Geo Location Quota

**Feature**: `002-nse-geo-location-quota`  
**Date**: 2026-07-13  
**Status**: Complete — all planning unknowns resolved

---

## Decision 1: Reverse geocoding provider

**Decision**: OpenStreetMap **Nominatim** reverse geocode over HTTPS `fetch` (no new npm dependency). Map response `address` fields to country / state / municipality / suburb-or-neighbourhood. Require `User-Agent` identifying the app; respect ~1 req/s. Optional env `NOMINATIM_BASE_URL` (default `https://nominatim.openstreetmap.org`) for self-hosted mirrors later.

**Rationale**: Spec forbids storing lat/lng and avoids LLM geo. Nominatim is free for light server-side use, returns administrative hierarchy adequate for CAM countries, and keeps YAGNI (constitution III). Neighborhood often missing → already specified (confirm with “No identificado”, ask barrio only if in quota).

**Alternatives considered**:
- **Google Geocoding API**: Better barrio coverage; requires billing key and new vendor. Deferred unless Nominatim miss-rate is unacceptable in QA.
- **Offline polygon / GeoJSON**: Highest control; heavy to build/maintain for 7 countries. Rejected for V1.
- **Mapbox**: Paid; similar complexity to Google. Rejected for V1.

---

## Decision 2: NSE CAM catalog format and import

**Decision**: Versioned static file `data/geo/cam-nse-regions.json` generated from *Muestra Regiones NSE CAM.xlsx*. Shape:

```json
{
  "version": "2026-07-13",
  "source": "Muestra Regiones NSE CAM.xlsx",
  "countries": {
    "Guatemala": [
      {
        "nseRegion": "...",
        "stateProvince": "...",
        "municipality": "..."
      }
    ]
  }
}
```

Lookup: normalize(country) + normalize(stateProvince) + normalize(municipality) → `nseRegion | null`. Dev script `scripts/import-cam-nse-excel.ts` (or documented one-shot) regenerates JSON; commit JSON in repo so runtime never reads Excel.

**Rationale**: FR-010 — update places without changing EXIT_B or flow code. Matches existing `data/geo/guatemala.json` pattern. In-process lookup is fast and observable.

**Alternatives considered**:
- **Parse Excel at runtime**: Needs `xlsx` in production bundle; brittle. Rejected.
- **DB table for catalog**: Overkill for static sample list; harder for ops to diff in git. Rejected for V1.

---

## Decision 3: GPS gate placement in the conversation

**Decision**: Insert a **GPS capture gate** immediately before the survey `country` question (after phone capture + `fullName`), mirroring `phone-capture.ts`. States on `flow_states`: e.g. `gpsGateStatus`: `pending_request` | `awaiting_location` | `awaiting_confirm` | `done` | `skipped_manual`. On success + in-quota, write profile geo fields and advance `surveyQuestionIndex` past country/state/municipality (and neighborhood if already known).

**Rationale**: Spec clarification — GPS first, before manual country. Phone already established the “gate before next survey Q” pattern.

**Alternatives considered**:
- Replace country question UI with GPS only inside `phase-1` without explicit gate: harder to reason about callbacks/location updates. Rejected.
- GPS before phone: mixes unrelated consent/contact with geo; out of scope. Rejected.

---

## Decision 4: Confirmation UX

**Decision**: After successful identification, send text summarizing País / Departamento / Municipio / Barrio (or “No identificado”) plus inline keyboard **Sí** / **No** (callbacks e.g. `gps:yes` / `gps:no`), reusing the style of `geo:yes:` / `geo:no:` fuzzy confirm. Sí → allowlist immediately. No → discard proposal → full manual geo.

**Rationale**: Spec requires explicit confirm; existing confirm machinery is familiar to the codebase.

**Alternatives considered**:
- Free-text “sí/no” only: ambiguous with FAQ digression. Prefer buttons + optional text alias.
- Auto-accept without confirm: contradicts clarify session. Rejected.

---

## Decision 5: Allowlist vs Guatemala fuzzy catalog

**Decision**: **NSE CAM JSON is the only geographic quota gate** for all seven countries (including Guatemala). Keep `guatemala.ts` for **manual-path UX** (typo correction / confirm prompts) when country is Guatemala; after a municipality is accepted (exact or fuzzy-confirmed), run `cam-nse-catalog` lookup. Out of allowlist → EXIT_B even if the place exists in `guatemala.json`.

**Rationale**: Spec: allowlist is quota, not a second Guatemala-only quota catalog. Avoids rewriting GT fuzzy UX while enforcing sample regions.

**Alternatives considered**:
- Delete Guatemala fuzzy: worse manual UX for GT typos. Rejected.
- Allowlist only inside GT JSON: breaks other countries. Rejected.

---

## Decision 6: Persistence of geo metadata

**Decision**: Add to `survey_profiles`: `nseRegion` (varchar), `geoSource` (`gps_share` | `text_exact` | `text_fuzzy`), `inQuotaGeo` (boolean). Transient proposal (resolved names) on `flow_states` JSONB `gpsProposal` until confirm. Never persist lat/lng columns.

**Rationale**: FR-008/009 + privacy assumption. Monitor already reads profile location fields.

**Alternatives considered**:
- Store lat/lng encrypted: unnecessary for product; privacy risk. Rejected.
- Only log geo_source without DB columns: fails SC-004 operator visibility. Rejected.

---

## Decision 7: Manual-path allowlist timing

**Decision**: After municipality is resolved on the manual path (post fuzzy confirm if any), run allowlist **before** asking neighborhood when possible; if out of quota → EXIT_B without barrio. Aligns with GPS path (clarify Q4). Practically: when saving municipality in phase-1 / survey-capture, invoke allowlist; on miss exit; on hit continue to neighborhood (or skip if already set).

**Rationale**: Consistent quota UX; avoid collecting barrio for out-of-sample leads.

---

## Decision 8: WhatsApp

**Decision**: Implement messaging port `sendLocationRequest` with Telegram adapter; WhatsApp branch no-ops or throws “not implemented” until adapter exists (same as other WA sends today). Business rules unchanged.

**Rationale**: Spec out-of-scope for building WA adapter; FR-001 allows WA when channel supports it.
