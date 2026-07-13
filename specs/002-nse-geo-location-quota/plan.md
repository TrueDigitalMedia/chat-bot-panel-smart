# Implementation Plan: NSE CAM Geo Location Quota

**Branch**: `002-nse-geo-location-quota` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-nse-geo-location-quota/spec.md`

## Summary

Add a geographic quota gate driven by the **Muestra Regiones NSE CAM** allowlist. At the survey geo step (before manual country/dept/muni/barrio), Telegram asks for GPS; reverse geocode → confirm place → allowlist by country+department+municipality → store `nseRegion` / `geoSource` and continue, or `quota_exhausted` + EXIT_B. Failures and confirmation rejection fall back to the existing manual geo questions with the **same** allowlist. Catalog ships as versioned JSON under `data/geo/`. Monitor shows NSE region and geo source. No Phase 2–4 redesign, no Bloque 2/3 IA.

## Technical Context

**Language/Version**: TypeScript / Node.js 20+ — Next.js 16 (App Router), strict mode.

**Primary Dependencies**:
- Existing: Next.js, Drizzle ORM, Neon Postgres, Telegram Bot API (HTTP), Zod, Vitest
- New (no npm package required for V1): OpenStreetMap **Nominatim** reverse geocode via `fetch` (User-Agent + rate limit)
- One-time / script: Excel → JSON import (dev script; `xlsx` or Python one-shot — not a runtime dependency)

**Storage**: Neon Postgres (existing `survey_profiles` + `flow_states`). Add columns: `nse_region`, `geo_source`, `in_quota_geo`. Transient GPS proposal stored on `flow_states` (JSONB or varchar fields) — **not** lat/lng on the lead.

**Testing**: Vitest for catalog lookup, name normalization, GPS gate state transitions, allowlist hit/miss. Manual / Playwright webhook simulation for Telegram location + confirm callbacks (quickstart scenarios).

**Target Platform**: Vercel serverless + Telegram webhook (same as today).

**Project Type**: Web service (Next.js App Router) — single monorepo app.

**Performance Goals**:
- Webhook ACK within ~1s (reverse geocode may run in deferred processing / `after()` if needed).
- Reverse geocode + allowlist decision within ~3s user-perceived after location share.
- Catalog lookup in-process O(1)/indexed — no DB round-trip for allowlist.

**Constraints**:
- Telegram V1 only for location request; WhatsApp adapter out of scope (same rules when added).
- Do not persist raw lat/lng on lead/profile (privacy / constitution PII).
- Do not add LLM calls for geo resolution.
- Reuse EXIT_B copy; reuse Guatemala fuzzy helpers where still useful on manual path; NSE CAM JSON is the quota gate for all CAM countries.
- Nominatim usage policy: identify app via User-Agent; max ~1 req/s; no bulk abuse.

**Scale/Scope**: Catalog ≈ hundreds–low thousands of municipality rows across 7 countries; concurrent conversations same as current bot (hundreds).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### I. AI Safety & Guardrails ✅

- No new LLM surface for GPS → place mapping (Nominatim + deterministic allowlist).
- Manual path may still use existing extraction for free text; no expansion of LLM geo authority for quota decisions — allowlist is authoritative after municipality is known.
- Lat/lng not stored on lead; not sent to LLM providers.

### II. Observability First ✅

- Structured logs for: GPS received (without storing coords in DB), reverse-geocode outcome (success/fail + country/admin names), confirm yes/no, allowlist hit/miss, `geo_source`, `nse_region`, EXIT_B geo.
- Monitor UI exposes `nseRegion`, `geoSource`, `inQuotaGeo` (FR-009).
- Document log queries / validation steps in [quickstart.md](quickstart.md).

### III. Simplicity / YAGNI ✅

- Static JSON catalog (no runtime Excel parsing).
- Nominatim via `fetch` (no new geocoding SDK).
- GPS gate mirrors existing phone-capture gate pattern.
- WhatsApp location deferred until adapter exists.
- Complexity Tracking: empty (no justified violations).

**Post-design re-check**: ✅ Gates still pass — contracts are messaging/webhook + lead profile fields; no new AI paths; observability fields explicit in data-model.

## Project Structure

### Documentation (this feature)

```text
specs/002-nse-geo-location-quota/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── telegram-location.md
│   └── lead-geo-fields.md
└── tasks.md              # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
data/geo/
├── guatemala.json              # existing fuzzy catalog (manual GT helpers)
└── cam-nse-regions.json        # NEW — NSE CAM allowlist (from Excel)

src/lib/geo/
├── guatemala.ts                # existing — keep for GT text fuzzy UX
├── confirm.ts / handle-confirm.ts
├── cam-nse-catalog.ts          # NEW — load JSON, normalize, lookup → nseRegion | null
├── reverse-geocode.ts          # NEW — Nominatim adapter → PlaceProposal
└── gps-confirm.ts              # NEW — confirm prompt / callbacks for GPS proposal

src/lib/conversation/
├── phone-capture.ts            # pattern reference
├── gps-capture.ts              # NEW — gate before country question
├── survey-questions.ts         # geo Q order unchanged; skip indices after GPS success
├── phases/phase-1.ts           # wire allowlist after municipality on manual path
└── flow-router.ts              # route location updates + gps confirm callbacks

src/lib/messaging/send.ts       # sendLocationRequest(to)
src/lib/telegram/send.ts        # request_location reply keyboard
src/types/telegram.ts           # request_location + Message.location
src/types/channel.ts            # inbound location lat/lng (ephemeral)
src/app/api/webhooks/telegram/route.ts  # parse location

src/lib/db/schema.ts            # survey_profiles + flow_states columns
drizzle/                        # migration 0007_* geo nse fields

src/app/conversations/          # show nseRegion, geoSource, inQuotaGeo
scripts/
└── import-cam-nse-excel.ts     # one-shot Excel → cam-nse-regions.json
```

**Structure Decision**: Extend the existing Next.js single-app layout. New geo modules under `src/lib/geo/` and a `gps-capture` conversation gate analogous to phone capture. No new apps/packages.

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
