# Implementation Plan: Nuevas preguntas de Fase 1 (opt-in, edad, embarazo, bebé)

**Branch**: `007-fase1-new-survey-questions` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-fase1-new-survey-questions/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a new opt-in decision gate before D1 (mirrors D1/D2/D3's exact pattern: a new `leads.opt_in_accepted` boolean, decline → `not_qualified`), and three new survey fields (edad, embarazo, bebé<3) appended to the **end** of the existing 16-question survey rather than inserted at their Excel-specified mid-sequence position — a deliberate deviation from spec.md's Assumptions, made after finding that mid-sequence insertion would silently misroute every lead mid-survey at deploy time (see research.md R1). Both changes reuse existing generic machinery (`SURVEY_FIELDS`-driven correction menu, index-driven `sendSurveyQuestion`, AI-based `extractField`) almost unchanged — the bulk of the work is registering the 4 new answers in ~6 small shared constant tables that are currently scattered across the codebase, plus fixing 7 call sites that hardcode the survey's question count as a magic number `16`.

## Technical Context

**Language/Version**: TypeScript 5 (existing conversation flow modules, Telegram + WhatsApp webhook handlers)

**Primary Dependencies**: None new. Reuses the existing AI extraction pipeline (`extractField`, Vercel AI SDK) for the free-text `age` question, and the existing button/callback machinery for the two Sí/No questions.

**Storage**: PostgreSQL (Neon) via Drizzle ORM. New migration `0011_...sql`: `leads.opt_in_accepted` (boolean, see R2 for the backfill requirement), `survey_profiles.age`/`is_pregnant`/`has_baby_under_3`.

**Testing**: Vitest for the new pure-logic pieces (field registration completeness, question-count constant usage) — this repo doesn't have unit tests for `phase-1.ts` itself (it's DB/webhook-coupled, exercised only by the `tests/e2e/phase-1-*.spec.ts` shallow-smoke pattern), so no new unit tests attempt to mock that file. Per the constitution ("Lead capture paths MUST have an end-to-end test"), one Playwright smoke test covering the new opt-in gate is added, following the existing `phase-1-disqualify.spec.ts` pattern.

**Target Platform**: Same as existing bot — Vercel serverless functions, Telegram + WhatsApp webhooks.

**Project Type**: Single Next.js web application (existing monolith).

**Performance Goals**: N/A beyond existing webhook latency — this is 3 more DB-backed conversational turns and one more decision gate, same cost profile as the existing 16.

**Constraints**: Must not change the mapping of the existing 16 survey questions' indices (research.md R1 — production safety for in-flight leads). Must not change `ScoringFields`/the SCL score for any existing data (spec SC-004) — structurally guaranteed since `ScoringFields = Pick<SurveyProfile, 'educationPsh'|'cars'|'domesticHelp'|'householdSize'|'bedrooms'>` doesn't reference the new fields at all.

**Scale/Scope**: 1 new DB migration (4 columns), ~11 existing files touched (mostly one-or-two-line additions to shared constant tables), 1 new e2e smoke test, 1 new unit test for the question-count constant.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails**: PASS. The one new AI-touching surface (`age` free-text extraction) reuses the existing `extractField`/`sanitizeInput`/Zod-schema pipeline verbatim — no new prompt-injection surface, same allowlist-by-schema pattern as `householdSize`/`bedrooms`.
- **II. Observability First**: PASS. The new opt-in decline reuses `transitionLead()`, which already emits the structured `event: lead_status_transition` log for every reason string — no new logging code needed, just a new reason string (`opt_in_decline`).
- **III. Simplicity / YAGNI**: PASS, with one explicit scope cut (research.md R3): the opt-in decline is **not** added to `qualification-eval.ts`'s `PHASE1_EVAL_REASONS`/`EvalScenarioType` — extending that QA-eval system (new scenario type, new switch-case branches in 3 functions, new fixtures) is out of scope; nothing in spec.md requests eval coverage for this specific decision point, and it would be a materially larger change than the feature itself for a decision point functionally identical to D1/D2 (immediate `not_qualified`, no other side effects).

No violations. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-fase1-new-survey-questions/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks — not created here)
```

No `contracts/` — no new external interface; this feature only changes conversational flow logic behind the existing Telegram/WhatsApp webhooks.

### Source Code (repository root)

```text
src/
├── lib/
│   ├── db/
│   │   ├── schema.ts                      # MODIFIED: leads.optInAccepted, survey_profiles.age/isPregnant/hasBabyUnder3
│   │   └── migrations/0011_fase1_new_questions.sql  # NEW — includes the opt-in backfill (research.md R2)
│   ├── conversation/
│   │   ├── survey-questions.ts             # MODIFIED: 3 new SURVEY_QUESTIONS entries (indices 17-19) + SURVEY_QUESTION_COUNT export
│   │   ├── correction-fields.ts            # MODIFIED: FIELD_LABELS/FIELD_ALIASES for age/isPregnant/hasBabyUnder3
│   │   ├── correction.ts                   # MODIFIED: replace hardcoded `16` with SURVEY_QUESTION_COUNT (2 call sites)
│   │   ├── faq-handler.ts                  # MODIFIED: replace hardcoded `16` with SURVEY_QUESTION_COUNT; add 'optin:' to the FAQ-skip prefix list
│   │   ├── flow-router.ts                  # MODIFIED: add 'optin:' (and the two new button fields) to BUTTON_PREFIXES
│   │   └── phases/
│   │       └── phase-1.ts                  # MODIFIED: new opt-in gate block (mirrors D1's exact shape) before the D1 block; replace hardcoded `16` (2 call sites)
│   ├── ai/
│   │   └── extract-survey-fields.ts        # MODIFIED: new `age` Zod schema (13-100, per spec Assumptions)
│   └── geo/
│       └── handle-confirm.ts               # MODIFIED: replace hardcoded `16` with SURVEY_QUESTION_COUNT (2 call sites)
└── types/
    └── lead.ts                             # MODIFIED: SurveyProfile.age/isPregnant/hasBabyUnder3, SURVEY_FIELDS/BUTTON_FIELDS/FREE_TEXT_FIELDS additions, Lead.optInAccepted

tests/
├── unit/
│   └── survey-question-count.test.ts       # NEW: SURVEY_QUESTIONS.length === SURVEY_FIELDS.length === SURVEY_QUESTION_COUNT (guards the two parallel arrays staying in sync)
└── e2e/
    └── phase-1-optin.spec.ts               # NEW: opt-in decline → not_qualified smoke test (constitution: lead-capture path)
```

**Structure Decision**: Single Next.js project (Option 1), consistent with 004/005/006. No new modules — this feature is entirely additive registrations into existing shared tables (`SURVEY_FIELDS`, `BUTTON_FIELDS`, `FIELD_LABELS`, `BUTTON_PREFIXES`, `FIELD_SCHEMAS`) plus one new gate block in `phase-1.ts` shaped identically to the existing D1 block.

## Complexity Tracking

*No violations — table intentionally left empty.*
