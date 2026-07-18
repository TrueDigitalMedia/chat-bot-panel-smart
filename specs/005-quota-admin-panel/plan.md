# Implementation Plan: Panel administrativo de cuotas

**Branch**: `005-quota-admin-panel` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-quota-admin-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a `quota_targets` table plus an authenticated `/admin/quotas` page and `/api/admin/quotas*` routes so Kantar's per-country/region/NSE-level lead targets live in Postgres instead of `docs/Kantar Quotas Test.xlsx`. Rewire `checkQuotaAvailability` (currently a deterministic-random mock) to query real target-vs-achieved counts, and update its two call sites (`phase-1.ts`, `handle-confirm.ts`) to pass the country/region data they already have loaded. Import/export round-trips through the existing `xlsx` dependency (already used by `scripts/import-cam-nse-excel.ts`), reusing that script's pattern rather than adding a new one. Admin auth is a single shared-password HTTP Basic Auth check in Next.js middleware — no user table, no new auth dependency.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16 App Router, Node.js runtime for API routes; Edge runtime for auth middleware)

**Primary Dependencies**: `xlsx` (already in `package.json`, already used by `scripts/import-cam-nse-excel.ts` — no new dependency), Drizzle ORM, `@neondatabase/serverless`. No new auth library — HTTP Basic Auth is ~15 lines of Edge middleware.

**Storage**: PostgreSQL (Neon) via Drizzle ORM. New migration adds `quota_targets` (see data-model.md). Reads join the existing `leads` + `survey_profiles` tables to compute "conseguidos" — no changes to those tables' schema, only to `checkQuotaAvailability`'s call signature.

**Testing**: Vitest for the quota-progress calculation and Excel-import mapping logic (pure functions, easy to unit test with fixture rows). Per the constitution ("Lead capture paths MUST have an end-to-end test before merging"), one Playwright smoke test covering the real (non-mock) `checkQuotaAvailability` decision path is required, following the existing `tests/e2e/phase-1-qualify.spec.ts` pattern.

**Target Platform**: Vercel serverless functions (API routes) + Edge middleware (auth gate) + React Server Components (admin page).

**Project Type**: Single Next.js web application (existing monolith under `src/`) — not a separate "web app: frontend+backend" split, since Next.js App Router already colocates both.

**Performance Goals**: N/A beyond existing webhook latency for the quota-check path (must stay fast — it runs synchronously inside the survey-completion webhook handler, same call site as today's mock). The admin panel itself has no throughput requirement (low-traffic internal tool, a handful of admins).

**Constraints**:
- No new external dependencies (Simplicity/YAGNI — `xlsx` already covers import/export; Basic Auth needs no library).
- `checkQuotaAvailability`'s signature changes from `(segment, leadId?)` to something that also carries `country` and `nseRegion` — both call sites already have a `profile` object in scope with those fields, so no extra DB query is introduced.
- Must not change `leads`/`survey_profiles` schemas — quota data is fully additive (`quota_targets`), joined at query time.

**Scale/Scope**: One new table (~132 rows for CAM after import — see research.md for the corrected count), ~4-5 new API routes, one new admin page, one Edge middleware file, a rewrite of `src/lib/scoring/quota.ts`, and updates to 2 existing call sites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails**: PASS. No LLM involved in this feature at all — it's CRUD + a lookup.
- **II. Observability First**: PASS, with an action item. The old mock already logs `[quota:mock] segment=... available=...`; the real check must keep an equivalent structured log line (`event: quota_check`, country, region, segment, target, achieved, available) so the same debugging visibility isn't lost. This is carried into data-model.md/contracts as a requirement, not just a suggestion.
- **III. Simplicity / YAGNI**: PASS. Basic Auth via env var (matches the spec's own stated assumption) instead of a user/roles system; Excel import reuses the existing `xlsx` dependency and the existing one-shot-script pattern instead of building generic file-upload infrastructure. Considered and rejected: a full RBAC system (no stated multi-admin need), a generic "import job queue" (a single synchronous parse-and-upsert is enough at this scale — 132 rows).

No violations. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-quota-admin-panel/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── contracts/              # Phase 1 output — API route contracts (this feature HAS an external interface)
│   └── admin-quotas-api.md
├── quickstart.md          # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 1: Single project (existing structure — no change)
src/
├── middleware.ts                       # NEW: Basic Auth gate for /admin and /api/admin/*
├── lib/
│   ├── quotas/                         # NEW module
│   │   ├── quota-targets.ts            # CRUD against quota_targets (list/create/update/toggle-active)
│   │   ├── quota-progress.ts           # join quota_targets + leads/survey_profiles → objetivo/conseguidos/disponibles
│   │   ├── excel-import.ts             # parse Kantar Quotas Test.xlsx-shaped workbook → quota_targets rows
│   │   └── excel-export.ts             # quota_targets + progress → xlsx workbook buffer
│   ├── scoring/
│   │   └── quota.ts                    # MODIFIED: checkQuotaAvailability queries quota_targets instead of random
│   ├── geo/
│   │   └── cam-nse-catalog.ts          # MODIFIED: add listNseRegionsForCountry() export (region dropdown source)
│   ├── conversation/
│   │   └── phases/phase-1.ts           # MODIFIED: pass profile.country/nseRegion into checkQuotaAvailability
│   └── db/
│       ├── schema.ts                   # MODIFIED: add quotaTargets table
│       └── migrations/0010_quota_targets.sql  # NEW
├── lib/geo/handle-confirm.ts            # MODIFIED: same checkQuotaAvailability call-site update as phase-1.ts
└── app/
    ├── admin/
    │   └── quotas/
    │       ├── page.tsx                # NEW: Server Component — region×NSE editable table
    │       └── quota-row-form.tsx      # NEW: Client Component — inline edit/activate-toggle
    └── api/
        └── admin/
            └── quotas/
                ├── route.ts             # NEW: GET (list+progress), POST (create)
                ├── [id]/route.ts        # NEW: PUT (update target/active)
                ├── import/route.ts      # NEW: POST multipart Excel upload
                └── export/route.ts      # NEW: GET → xlsx download

tests/
├── unit/
│   ├── quota-progress.test.ts          # NEW: objetivo/conseguidos/disponibles math, clamping at 0
│   └── quota-excel-import.test.ts      # NEW: row→QuotaTarget mapping, country/region normalization, unmatched-row reporting
└── e2e/
    └── quota-check-real.spec.ts        # NEW: survey completion respects a real configured quota (replaces mock assumption)
```

**Structure Decision**: Single Next.js project (Option 1), consistent with 004. New `src/lib/quotas/` module groups the quota-target CRUD/progress/import/export logic so it's reusable by the leads dashboard (spec 006), which needs the same "objetivo/conseguidos/disponibles by region×NSE" data. `src/middleware.ts` doesn't currently exist — this feature creates it, scoped only to `/admin` and `/api/admin` paths via `matcher` so it doesn't affect the bot's own webhook routes.

## Complexity Tracking

*No violations — table intentionally left empty.*
