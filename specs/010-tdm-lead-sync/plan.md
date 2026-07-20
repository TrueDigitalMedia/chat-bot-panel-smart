# Implementation Plan: Sync de Leads a TDM (Solo Escritura)

**Branch**: `010-tdm-lead-sync` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-tdm-lead-sync/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Write a consolidated snapshot of each qualified lead into TDM/Kantar's existing
`tb_leads_agente_ia` MySQL table (`db_kantar_leads`, host `tdm-out-01.boa-analytics.com`)
at the two moments the bot has meaningful data: Phase 1 completion with quota available
(`INSERT`), and Ficha Hogar completion or Q1 discard (`UPDATE`, keyed by the
MySQL-assigned id saved back onto the Postgres `leads` row, since we have no DDL access
to add our own uniqueness constraint on their side). The sync is opt-in
(`CLIENT_MYSQL_SYNC_ENABLED`, off by default), fire-and-forget from the user's
perspective (never throws, never blocks the conversation, logs every attempt via
`logCall`), and strictly write-only — it never reads back anything TDM's internal
process writes into that table. The existing mock registration-code path
(`mock-registration.ts`) is untouched.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js runtime, target ES2017/ESNext modules (matches existing `tsconfig.json`).

**Primary Dependencies**: `mysql2` (new — `mysql2/promise`, see [research.md](research.md) R1) for the MySQL client; existing `drizzle-orm` + `@neondatabase/serverless` for the Postgres side (`leads.tdmLeadId`/`tdmSyncStatus`/`tdmLastSyncAt` write-back); existing `zod` for the nine new `CLIENT_MYSQL_*` fields on `env.ts`.

**Storage**: Postgres/Neon (unchanged, still the only operational database — three new nullable columns on `leads`) + a write-only integration with TDM's externally-owned MySQL (`db_kantar_leads.tb_leads_agente_ia`, no DDL access, INSERT/UPDATE only).

**Testing**: Vitest (`src/lib/tdm-mysql/field-map.test.ts` pure/no-mock, `src/lib/tdm-mysql/sync.test.ts` with `vi.mock` on `@/lib/db/client`, `@/lib/tdm-mysql/client`, `@/lib/env` — matching the project's established eager-env-validation mock pattern, e.g. `tests/unit/ficha-hogar-validation.test.ts`).

**Target Platform**: Vercel serverless functions (Next.js App Router), same as the rest of the bot — each invocation is an independent, ephemeral process, which drives the connection-pool sizing decision in research.md R2.

**Project Type**: Single Next.js web application (existing monolith — no new project/package boundary).

**Performance Goals**: Not on the user-facing critical path — the sync must add no perceptible delay to the chat response (spec SC-001); no specific throughput target beyond current lead volume (low hundreds/day scale, unchanged by this feature).

**Constraints**: Zero impact on chat availability/latency if TDM's MySQL is slow, unreachable, or misconfigured (spec FR-007, SC-002); at most 1 pooled connection per serverless process to the external MySQL server (research.md R2); no DDL/schema-modification capability on the target database.

**Scale/Scope**: Two new call-site integrations plus one shared helper (`finalizeQuotaPassedLead`) to de-duplicate the two Phase 1 completion paths; one new internal module (`src/lib/tdm-mysql/`, 4 files); one Postgres migration adding 3 columns; no new UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails** — N/A for the write path itself (no LLM call is added;
  the AI-generated `conversationSummary` already exists and is only *forwarded*, not
  newly produced, by this feature). The broader concern this principle gestures at —
  sending PII to a third party without justification — is addressed under Principle II
  below via the pre-existing spec 001 contract that already scoped this data flow.
  **PASS**.
- **II. Observability First** — Satisfied by design: every sync attempt (success or
  failure) is logged via `logCall()`/`system_call_logs` with a correlation ID, matching
  the project's existing convention (see [tdm-mysql-sync-module.md](contracts/tdm-mysql-sync-module.md)
  §"Guarantees"). No PII values go into the logged `error` string, matching spec 001's
  contract §5 constraint. **PASS**.
- **III. Simplicity / YAGNI** — The design deliberately avoids an ORM/query builder for
  MySQL (raw `mysql2` `execute()` calls, research.md R1), avoids an outbox/2PC mechanism
  for the known duplicate-on-crash edge case (research.md R3, accepted risk instead), and
  factors out `finalizeQuotaPassedLead` only because the duplication it removes already
  exists identically in two files today (not a hypothetical future need). **PASS**.
- **Technology Stack gate — "Storage: Vercel KV or Vercel Postgres... no external
  databases without documented justification."** This feature adds a write-only
  integration with an *external, client-owned* MySQL database. This is a deviation from
  the stack default and is logged with justification in **Complexity Tracking** below —
  it is not a new *operational* datastore for the bot (Postgres/Neon remains the only
  database the bot reads from or depends on); it is closing a previously-specified,
  unbuilt integration contract (spec 001, `client-mysql-integration.md`) with a system
  the bot does not own or control.

**Result**: PASS, with one logged and justified Technology Stack deviation (external
MySQL write target) — see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-tdm-lead-sync/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── tdm-mysql-sync-module.md
│   └── tb-leads-agente-ia-write-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Single Next.js project (existing structure, no new project boundary) — this feature adds
one new module directory and touches four existing files:

```text
src/
├── lib/
│   ├── tdm-mysql/                          # NEW — mirrors the flat style of src/lib/treinta/
│   │   ├── client.ts                       # pool singleton + isClientMysqlConfigured/SyncEnabled
│   │   ├── field-map.ts                    # pure mapping functions, zero I/O
│   │   ├── sync.ts                         # syncLeadPhase1Complete / FichaHogarComplete / FichaHogarDiscarded
│   │   ├── field-map.test.ts               # NEW — pure unit tests, no mocks
│   │   └── sync.test.ts                    # NEW — vi.mock'd db/client, tdm-mysql/client, env
│   ├── db/
│   │   ├── schema.ts                       # EDIT — add tdmLeadId/tdmSyncStatus/tdmLastSyncAt to `leads`
│   │   └── migrations/
│   │       └── 0013_tdm_mysql_sync.sql     # NEW
│   ├── scoring/
│   │   └── quota.ts                        # EDIT (or new sibling file) — finalizeQuotaPassedLead() shared helper
│   ├── geo/
│   │   └── handle-confirm.ts               # EDIT — call finalizeQuotaPassedLead() after transitionLead(..., 'link_sent', ...) at line ~110
│   └── conversation/phases/
│       ├── phase-1.ts                      # EDIT — same call site, ~line 303 (the other path to the same transition)
│       └── phase-4.ts                      # EDIT — completeFichaHogar() calls syncLeadFichaHogarComplete; Q1 discard branch (~line 126-140) calls syncLeadFichaHogarDiscarded
├── types/
│   └── lead.ts                             # EDIT — add tdmLeadId/tdmSyncStatus/tdmLastSyncAt to Lead; add missing nseRegion to SurveyProfile
└── lib/env.ts                              # EDIT — add CLIENT_MYSQL_* fields + helpers

.env.example                                # EDIT — replace TBD CLIENT_MYSQL_LEADS_TABLE/CODE_COLUMN placeholders (lines 18-27) with the finalized var list
```

**Structure Decision**: Everything lives inside the existing single-project layout under
`src/lib/`, `src/types/`, and `src/env.ts` — no new package/app boundary, matching every
prior feature in this repo (specs 001-009). The new module follows the flat,
single-responsibility-file style already established by `src/lib/treinta/` (its only
sibling doing an external-system, best-effort persistence side effect) rather than
introducing a new internal architecture pattern.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| External MySQL database as a write target (Technology Stack gate: "no external databases without documented justification") | TDM/Kantar's downstream registration process already lives on a MySQL database it owns (`tb_leads_agente_ia`) with no DDL access granted to this project — the bot must write into *their* system to hand off qualified leads, per the integration contract already defined (unimplemented) in spec 001. | Not adding the integration was considered (do nothing) — rejected because it leaves the spec 001 contract permanently unimplemented and TDM has no automated way to receive qualified leads. Migrating the bot's own storage to that MySQL was also considered and rejected outright (no DDL access — Postgres/Neon must remain the bot's operational database; see spec.md Context). |
