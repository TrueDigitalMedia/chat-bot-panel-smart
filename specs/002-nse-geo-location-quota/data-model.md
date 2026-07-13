# Data Model: NSE CAM Geo Location Quota

**Feature**: `002-nse-geo-location-quota`  
**Date**: 2026-07-13

---

## Entity: NseCamCatalogEntry (static file)

Source of truth for geographic quota eligibility. Not a DB table — loaded from `data/geo/cam-nse-regions.json`.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `nseRegion` | string | NOT NULL | Región NSE label from Excel |
| `stateProvince` | string | NOT NULL | Departamento / provincia |
| `municipality` | string | NOT NULL | Municipio / cantón |
| *(key)* | country | parent key in JSON | One of: Panamá, Guatemala, Costa Rica, El Salvador, Nicaragua, Honduras, República Dominicana (canonical names aligned with survey country buttons) |

**Validation / lookup rules**:
- Normalize accents, case, punctuation, and whitespace before match.
- Match key = `country + stateProvince + municipality`.
- Hit → return `nseRegion`; miss → `null` (out of geographic quota).
- Neighborhood is **not** part of the key.

---

## Entity: SurveyProfile (extensions)

Existing geo fields retained; new quota/traceability fields:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `country` | VARCHAR(50) | existing | From GPS confirm or manual buttons |
| `stateProvince` | VARCHAR(100) | existing | Departamento / provincia |
| `municipality` | VARCHAR(100) | existing | Municipio / cantón |
| `neighborhood` | VARCHAR(100) | existing | Barrio / zona; may be filled after allowlist pass |
| `nseRegion` | VARCHAR(100) | NEW, NULLABLE | Set on allowlist hit; null on miss / not yet evaluated |
| `geoSource` | VARCHAR(20) | NEW, NULLABLE | `gps_share` \| `text_exact` \| `text_fuzzy` |
| `inQuotaGeo` | BOOLEAN | NEW, NULLABLE | `true` hit, `false` miss (EXIT_B geo), null if geo gate not reached |

**Rules**:
- On allowlist miss: set `inQuotaGeo = false`, set `lead.leadStatus = quota_exhausted`, do not clear already-collected geo names used for the decision (useful for ops).
- On hit: set `inQuotaGeo = true`, `nseRegion` from catalog, persist country/state/municipality (and neighborhood when known).
- Never store latitude/longitude on this entity.

---

## Entity: FlowState (extensions)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `gpsGateStatus` | VARCHAR(30) | NEW, NULLABLE | `pending_request` \| `awaiting_location` \| `awaiting_confirm` \| `done` \| `skipped_manual` |
| `gpsProposal` | JSONB | NEW, NULLABLE | `{ country, stateProvince, municipality, neighborhood \| null }` pending user confirm; cleared after yes/no |

**Transitions (GPS gate)**:

```text
(start geo) → pending_request → (send location keyboard) → awaiting_location
awaiting_location → (location OK) → awaiting_confirm
awaiting_location → (cancel / unusable) → skipped_manual → manual Q country…
awaiting_confirm → (Sí + allowlist hit) → done (+ maybe ask neighborhood only)
awaiting_confirm → (Sí + allowlist miss) → done + lead quota_exhausted
awaiting_confirm → (No) → skipped_manual → manual Q country…
```

---

## Entity: GpsPlaceProposal (ephemeral)

In-memory / `flow_states.gpsProposal` only — not a table.

| Field | Description |
|-------|-------------|
| `country` | Resolved country name |
| `stateProvince` | Resolved admin level 1 |
| `municipality` | Resolved admin city/town/municipality |
| `neighborhood` | Suburb/neighbourhood if present; else null |

Shown to user for confirmation before allowlist.

---

## Entity: Lead (unchanged status enum)

Reuse existing `quota_exhausted` for geo miss (same EXIT_B as D3 No / post-survey no slot). No new `lead_status` values.

---

## Relationships

```text
Lead 1──1 SurveyProfile
Lead 1──1 FlowState
SurveyProfile.nseRegion ←── lookup(NseCamCatalogEntry) on hit
FlowState.gpsProposal ──transient──▶ SurveyProfile geo fields on confirm+hit
```
