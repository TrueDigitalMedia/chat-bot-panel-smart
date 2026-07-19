# Implementation Plan: Dashboard de leads

**Branch**: `006-leads-dashboard` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-leads-dashboard/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add `/admin/dashboard`: summary cards, a región×NSE progress table with color-coding, a per-country bar chart, a 7-stage conversion funnel, and filters (país/NSE/región/canal/rango de fechas) — all read-only reporting over data that already exists. Reuses `listQuotaProgress()` from spec 005 (extended with optional `channel`/date-range filters) for the cards/table/chart, and adds one new function (`getConversionFunnel()`) for the funnel. No new dependencies, no new API routes, no new auth code — the existing `src/middleware.ts` matcher already covers `/admin/dashboard` and `/api/admin/*`.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16 App Router)

**Primary Dependencies**: None new. Reuses `src/lib/quotas/quota-progress.ts` (spec 005), Drizzle ORM, existing `leads`/`survey_profiles`/`quota_targets` tables.

**Storage**: PostgreSQL (Neon), read-only for this feature — no schema changes.

**Testing**: Vitest for the funnel-stage counting logic and the extended filter conditions in `quota-progress.ts` (pure/mockable, same pattern as spec 005). No e2e test required by the constitution — this is a read-only reporting surface, not a lead-capture path.

**Target Platform**: Vercel serverless (React Server Components + one small Client Component for filters/polling).

**Project Type**: Single Next.js web application (existing monolith).

**Performance Goals**: SC-001 (<5s to read the summary) / SC-002 (data reflects lead changes within a 60s refresh cycle) — both satisfied by direct server-side reads plus a 60s client-side poll, no caching layer needed at this scale (low admin traffic, per spec 005's precedent).

**Constraints**: No WebSockets (per spec Assumptions — polling only). No new charting library (see research.md R1). Filters via URL search params, not client-side state.

**Scale/Scope**: 1 new page, 1 new small module (`funnel.ts`), 1 modified module (`quota-progress.ts` — additive optional filters, no breaking change to existing spec-005 callers), 2 small Client Components (filters, refresh).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails**: PASS. No LLM involved — pure data aggregation and display.
- **II. Observability First**: PASS. Read-only reporting; no new write paths to log. No action needed.
- **III. Simplicity / YAGNI**: PASS, with two explicit simplifications from the WIKI's original proposal (documented in research.md R1/R5): no new charting dependency (plain CSS bars suffice at this cardinality — ≤7 countries), and no dedicated `/api/admin/dashboard/*` REST routes (nothing in spec.md requires external/curl access to this data; the Server Component reads directly, same pattern as `/admin/quotas`'s page in spec 005).

No violations. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-leads-dashboard/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks — not created here)
```

No `contracts/` — no new external interface (research.md R5: no dedicated API routes, unlike spec 005 which needed them for client-side mutations).

### Source Code (repository root)

```text
src/
├── lib/
│   ├── quotas/
│   │   └── quota-progress.ts        # MODIFIED (additive): listQuotaProgress()/countAchieved()
│   │                                 #   gain optional { channel?, dateFrom?, dateTo? } filters
│   └── dashboard/                    # NEW module
│       └── funnel.ts                 # getConversionFunnel(filters) — 7-stage counts
└── app/
    └── admin/
        └── dashboard/
            ├── page.tsx               # NEW: Server Component, reads searchParams directly
            ├── filters-form.tsx       # NEW: Client Component — updates URL search params
            ├── refresh-poller.tsx     # NEW: Client Component — 60s poll + manual refresh button
            └── dashboard.module.css   # NEW

tests/
└── unit/
    ├── quota-progress-filters.test.ts # NEW: channel/date-range filter logic
    └── conversion-funnel.test.ts      # NEW: 7-stage counting logic
```

**Structure Decision**: Single Next.js project (Option 1), consistent with 004/005. `/admin/dashboard` sits alongside `/admin/quotas` under the same `middleware.ts` auth gate (no changes needed there — the existing `/admin/:path*` matcher already covers it). `funnel.ts` is a new small module under `src/lib/dashboard/` rather than folded into `src/lib/quotas/`, since a conversion funnel is about the lead pipeline in general, not quota targets specifically — but it imports `QUALIFIED_STATUSES` from `quota-progress.ts` to keep the "calificaron por NSE + cupo" stage consistent with spec 005's own definition of that same concept.

## Complexity Tracking

*No violations — table intentionally left empty.*
