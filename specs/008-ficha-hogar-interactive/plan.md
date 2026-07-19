# Implementation Plan: Ficha Hogar interactiva (Fase 4)

**Branch**: `008-ficha-hogar-interactive` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-ficha-hogar-interactive/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

**Phase 4 today has zero interactivity**: `handlePhase3Success` calls `handlePhase4` synchronously the instant the user confirms registration, which immediately generates the AI summary and persists to Treinta — no questions are ever asked. Making it interactive means giving Phase 4 the same architecture Phase 1 already has: a new table (`ficha_hogar_profiles`) to hold per-question progress, a new `flow-router.ts` branch that routes subsequent messages while `leadStatus === 'code_delivered_registered'` into a new per-message handler, and a 7-question array mirroring `SURVEY_QUESTIONS`'s shape. The conflict-of-interest question (Q1) is a hard gate — answering "Sí" ends the flow in a new terminal status (`ficha_hogar_descartado`) before any of the AI-summary/Treinta-persist code runs. The existing summary/persist logic is kept almost as-is, just fed a merged Phase-1 + Ficha-Hogar profile instead of Phase-1 data alone.

## Technical Context

**Language/Version**: TypeScript 5 (existing conversation flow modules, Telegram + WhatsApp webhook handlers)

**Primary Dependencies**: None new. Reuses the existing AI extraction pipeline (`extractField`) for the two free-text questions (`dateOfBirth`, `petCount`), and the existing button/callback + `sendInlineKeyboard` machinery for the five Sí/No/multiple-choice questions.

**Storage**: PostgreSQL (Neon) via Drizzle ORM. New migration: `ficha_hogar_profiles` table (1:1 with `leads`, own `questionIndex` for progress tracking — not reusing `leads.surveyQuestionIndex`, which is Phase-1-specific) + `leads.lead_status` enum gains `'ficha_hogar_descartado'`.

**Testing**: Vitest for the new pure-logic pieces (discard-vs-continue branching, date-of-birth plausibility validation). Per the constitution ("Lead capture paths MUST have an end-to-end test"), one Playwright smoke test covering the discard path, following the existing `phase-1-disqualify.spec.ts` pattern.

**Target Platform**: Same as existing bot — Vercel serverless functions, Telegram + WhatsApp webhooks.

**Project Type**: Single Next.js web application (existing monolith).

**Performance Goals**: N/A beyond existing webhook latency — 7 more conversational turns, same cost profile as Phase 1's 19.

**Constraints**: Must not change how/where the AI summary is consumed downstream in Treinta (spec Assumption) — `persistTreintaPanelist()`'s contract is untouched; Ficha Hogar answers are merged into the same `profile`-shaped object it already accepts. Must not re-survey leads that already reached `ficha_hogar_completada` before this ships (spec Assumption) — the new flow only triggers for leads newly entering Phase 4 post-deploy, since it's driven by a brand-new table with no historical rows.

**Scale/Scope**: 1 new migration (1 table + 1 enum value), 1 new questions file, 1 rewritten phase handler, 1 new lightweight correction module, 2 small existing-file edits (`phase-3.ts`, `flow-router.ts`, `transitions.ts`, `types/lead.ts`), 1 new e2e test, 2 new unit tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails**: PASS. The two new AI-touching extractions (`dateOfBirth`, `petCount`) reuse the existing `extractField`/`sanitizeInput`/Zod-schema pipeline verbatim. The AI summary prompt now includes health-condition and date-of-birth data — flagged explicitly in research.md R6: this doesn't introduce a *new* consent gap, since the existing D1 T&C acceptance is already the documented justification for the whole profile (name, email, etc.) flowing into the same summary pipeline today; Ficha Hogar answers are additive to an already-consented data flow, not a new category.
- **II. Observability First**: PASS. The new discard transition reuses `transitionLead()`, which already emits the structured `event: lead_status_transition` log for any reason string — no new logging code needed.
- **III. Simplicity / YAGNI**: PASS, with two explicit scope cuts (research.md R3/R7): (1) Ficha Hogar gets its own small, self-contained correction menu instead of generalizing the existing `SURVEY_FIELDS`-bound correction system to be polymorphic across tables — that refactor would be larger than this feature itself. (2) No FAQ-digression support for Ficha Hogar (Phase 4 has never had it, spec doesn't request it) — the new `flow-router.ts` branch stays as simple as the existing `waiting_for_code` branch, not as complex as Phase 1's.

No violations. Complexity Tracking table left empty.

## Project Structure

### Documentation (this feature)

```text
specs/008-ficha-hogar-interactive/
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
│   │   ├── schema.ts                       # MODIFIED: ficha_hogar_profiles table; leadStatusEnum += 'ficha_hogar_descartado'
│   │   └── migrations/0012_ficha_hogar.sql # NEW
│   ├── state-machine/
│   │   └── transitions.ts                  # MODIFIED: code_delivered_registered → +'ficha_hogar_descartado'; new terminal status
│   ├── ai/
│   │   └── extract-survey-fields.ts        # MODIFIED: +dateOfBirth, +petCount Zod schemas in FIELD_SCHEMAS
│   └── conversation/
│       ├── ficha-hogar-questions.ts        # NEW: 7-question array (same shape as SURVEY_QUESTIONS)
│       ├── ficha-hogar-correction.ts       # NEW: small standalone correction menu for the 7 fields (research.md R3)
│       └── phases/
│           ├── phase-3.ts                  # MODIFIED: handlePhase3Success now sends Q1 instead of running the old one-shot completion
│           └── phase-4.ts                  # REWRITTEN: interactive per-message handler (discard gate + 6 more questions) + existing summary/persist logic, now fed the merged profile
│       └── flow-router.ts                  # MODIFIED: new branch for status === 'code_delivered_registered'
└── types/
    └── lead.ts                             # MODIFIED: LeadStatus += 'ficha_hogar_descartado'; new FichaHogarProfile interface + FICHA_HOGAR_FIELDS array

tests/
├── unit/
│   └── ficha-hogar-validation.test.ts      # NEW: date-of-birth plausibility (not future, reasonable age), discard branching
└── e2e/
    └── phase-4-discard.spec.ts             # NEW: conflict-of-interest "Sí" → ficha_hogar_descartado, no Treinta persist call
```

**Structure Decision**: Single Next.js project (Option 1), consistent with 004-007. Ficha Hogar gets its own table and its own small conversation-flow module rather than extending `survey_profiles`/`SURVEY_FIELDS` — it's a distinct questionnaire (Fase 4, post-registration) from the Phase-1 NSE/quota survey, matching the spec's own Key Entity name (`FichaHogarProfile`, not an extension of `SurveyProfile`).

## Complexity Tracking

*No violations — table intentionally left empty.*
