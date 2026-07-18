# Implementation Plan: Corrección de la fórmula de scoring SCL-CAM

**Branch**: `004-scl-cam-scoring-fix` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-scl-cam-scoring-fix/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Replace the arbitrary 0-100 socioeconomic scoring in `src/lib/scoring/socioeconomic.ts` with the official Kantar Worldpanel SCL-CAM formula (`SCL = (45×NiPSH + 18×HACI + 28×AUTO + 9×SD) / 100`), classify into `Nivel 1-4` instead of México-style segments (`A/B, C+, C, D+, D/E`), expand the PSH education question to the 12 official options, and relabel the gender question to `Masculino`/`Femenino`. This is a pure logic + copy fix inside the existing conversation flow and scoring module — no new tables, routes, or external dependencies are needed; every caller of `calculateScore`/`getQuotaSegment` (survey completion, geo-confirmation completion, and the QA qualification-eval recalculation) is fixed automatically because they all funnel through the same two functions.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16 App Router, Node.js runtime)

**Primary Dependencies**: None new. Reuses existing modules: `src/lib/scoring/socioeconomic.ts`, `src/lib/conversation/survey-questions.ts`, `src/types/lead.ts`, Drizzle ORM for the already-existing `survey_profiles`/`leads` columns.

**Storage**: PostgreSQL (Neon) via Drizzle ORM. No schema migration required — `education_psh` is `varchar(50)` (the longest new option, "Alfabetizado pero no en escuela normal", is 39 chars), `gender` is `varchar(20)` (fits "Masculino"/"Femenino"), `quota_segment` is `varchar(50)` (fits "Nivel 1".."Nivel 4"), and `leads.score` is `smallint` (max possible SCL score is 1000, well within range — see research.md for the rounding implication).

**Testing**: Vitest (`tests/unit/scoring.test.ts` — rewritten to assert the official formula) and `tests/unit/qualification-eval.test.ts` (fixtures reference the old `A/B`/`D/E` segment literals and must be updated to `Nivel` values). No Playwright/e2e changes required since this doesn't alter conversation control flow, only computed values and button copy.

**Target Platform**: Vercel serverless functions (Next.js webhook handlers for Telegram/WhatsApp).

**Project Type**: Single Next.js web application (existing monolith under `src/`).

**Performance Goals**: N/A beyond existing webhook response times — scoring is a synchronous, O(1) pure calculation with no I/O.

**Constraints**: Must not change the `SurveyProfile`/`Lead` schema shape (field names/types) — only the value domains of `educationPsh`, `gender`, and `quotaSegment` change. Must not touch México/Ecuador segment logic (out of scope per spec Assumptions) since neither currently has separate code paths — the fix targets the single shared CAM-oriented implementation.

**Scale/Scope**: ~4 source files change (`socioeconomic.ts`, `survey-questions.ts`, `types/lead.ts` if a literal union is introduced, `tests/unit/scoring.test.ts`) plus one existing test fixture file (`qualification-eval.test.ts`). No new files, no new directories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails**: PASS. No LLM prompt or output-validation changes — the education/gender questions remain fixed-option button flows (allowlisted `callback_data` values), and this feature only changes which options are in that allowlist. No new user free-text input surface is introduced.
- **II. Observability First**: PASS. Score and segment are already persisted on `leads` (`score`, `quota_segment`) and logged through existing lead-update/eval paths; no new external call is introduced that would need new logging. No action required beyond keeping the existing update-and-log call sites intact.
- **III. Simplicity / YAGNI**: PASS. The fix is a like-for-like rewrite of existing pure functions to match a fully-specified external formula (Kantar `SCL-CAM.pdf`, transcribed in `docs/WIKI.md` §6). No new abstraction, class, or dependency is introduced — the four dimension calculations (NiPSH, HACI, AUTO, SD) remain plain functions/lookup tables in the same file.

No violations. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-scl-cam-scoring-fix/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature exposes no new external interface (no new API route, no new webhook payload shape). It changes the internal implementation and return-value domain of two existing pure functions (`calculateScore`, `getQuotaSegment`) that are already called from within the same codebase.

### Source Code (repository root)

```text
# Option 1: Single project (existing structure — no change)
src/
├── lib/
│   ├── scoring/
│   │   ├── socioeconomic.ts     # MODIFIED: NiPSH/HACI/AUTO/SD tables + weighted formula + Nivel 1-4 classification
│   │   └── quota.ts             # UNCHANGED (mock quota check — replaced by spec 005, not this feature)
│   ├── conversation/
│   │   └── survey-questions.ts  # MODIFIED: 12 education options, Masculino/Femenino gender options
│   ├── geo/
│   │   └── handle-confirm.ts    # UNCHANGED (calls calculateScore/getQuotaSegment — inherits the fix)
│   ├── eval/
│   │   └── qualification-eval.ts # UNCHANGED (calls calculateScore/getQuotaSegment — inherits the fix)
│   └── db/
│       └── schema.ts            # UNCHANGED (existing column widths already accommodate new values)
└── types/
    └── lead.ts                  # POSSIBLY MODIFIED: narrow educationPsh/gender/quotaSegment to literal unions (see research.md)

tests/
└── unit/
    ├── scoring.test.ts           # REWRITTEN: assert official formula outputs and Nivel 1-4 thresholds
    └── qualification-eval.test.ts # MODIFIED: fixtures updated from A/B, D/E → Nivel 1, Nivel 4
```

**Structure Decision**: Single Next.js project (Option 1), no new directories. This feature is a targeted correction inside the existing `src/lib/scoring/` and `src/lib/conversation/` modules; every consumer (`phase-1.ts`, `handle-confirm.ts`, `qualification-eval.ts`) is fixed transitively because they all call the two shared functions being corrected.

## Complexity Tracking

*No violations — table intentionally left empty.*
