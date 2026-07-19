---

description: "Task list for 008-ficha-hogar-interactive"
---

# Tasks: Ficha Hogar interactiva (Fase 4)

**Input**: Design documents from `/specs/008-ficha-hogar-interactive/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: One e2e smoke test for the discard path (constitution: lead-capture path). One unit test for date-of-birth plausibility validation, the one piece of non-trivial pure logic in this feature.

**Organization**: Tasks are grouped by user story (P1–P2 from spec.md). ⚠️ **Read the Dependencies section before assuming any story ships alone** — unlike specs 004-007, this feature has no safe partial-deployment point (see below).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Next.js project — `src/`, `tests/` at repository root (plan.md § Project Structure).

---

## Phase 1: Setup

- [ ] T001 Confirm no new dependencies needed (reuses `extractField`, `sendInlineKeyboard`, `transitionLead`, `persistTreintaPanelist` as-is). No file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data layer only — genuinely needed before any story, since nothing in this feature works without the table, the type, and the new terminal status existing.

- [X] T002 Write `src/lib/db/migrations/0012_ficha_hogar.sql`: `CREATE TABLE ficha_hogar_profiles` (per data-model.md — `lead_id`, `question_index`, 7 answer columns, `completed_at`, timestamps) + `ALTER TYPE lead_status ADD VALUE 'ficha_hogar_descartado'` (note in the file: safe as a standalone statement on Postgres 12+/Neon, per research.md R2).
- [X] T003 Update `src/lib/db/schema.ts`: add `fichaHogarProfiles` table and the new `leadStatusEnum` value, matching T002. Depends on T002.
- [X] T004 [P] Update `src/types/lead.ts`: add `'ficha_hogar_descartado'` to `LeadStatus`; add a `FichaHogarProfile` interface (7 fields + `id`/`leadId`/`questionIndex`/`completedAt`); add `FICHA_HOGAR_FIELDS` const array (`as const satisfies (keyof FichaHogarProfile)[]`, 7 entries in question order) and `FichaHogarFieldName` type. Also added `FICHA_HOGAR_BUTTON_FIELDS`/`FICHA_HOGAR_FREE_TEXT_FIELDS` sets (mirroring `SURVEY_FIELDS`'s pattern) — needed by T008's capture logic, not in the original plan file list but a natural extension.
- [X] T005 [P] Update `src/lib/state-machine/transitions.ts`: `code_delivered_registered` gains `'ficha_hogar_descartado'` as a valid target; add `ficha_hogar_descartado: new Set([])` (terminal — `isTerminal()` needed no changes, it already computes this from empty sets).
- [X] T006 [P] In `src/lib/ai/extract-survey-fields.ts`, add `dateOfBirth`/`petCount` to `FIELD_SCHEMAS`. **Found and fixed a real gap while doing this**: the generic extraction prompt (`buildExtractionPrompt`) only ever said "Field to extract: {fieldName}" with no format guidance — for a free-text date, the model could easily return "5 de mayo de 1990" instead of "05/05/1990" and fail the Zod regex. Added an optional `hint` param to `buildExtractionPrompt` and a `FIELD_HINTS` map (currently just `dateOfBirth`) so the prompt explicitly states the required format.

**Checkpoint**: Schema, types, and state machine support the new flow. `npx tsc --noEmit` clean; `npx vitest run tests/unit` → 102/102 passing, zero regressions. No user-facing behavior yet — that's every remaining task.

---

## Phase 3: User Story 1 - Pregunta de descarte por conflicto de interés (Priority: P1)

**Goal**: Fase 4 becomes interactive at all — asks the conflict-of-interest question first, discards correctly on "Sí".

**Independent Test** (per spec.md): answer "Sí" and confirm the flow stops there, no further questions, no Treinta persist.

⚠️ **This story necessarily builds the entire interactive engine**, not just the discard branch — Phase 4 has zero message-handling infrastructure today (research.md R1), so making *any* single question interactive requires building the full per-message handler, the router wiring, and the entry point. US2 then only *adds* 6 more entries to a data structure this story creates.

### Implementation for User Story 1

- [X] T007 [US1] Create `src/lib/conversation/ficha-hogar-questions.ts` with **only** the first entry (index 1, `conflictOfInterest`, button Sí/No) — same shape as `SURVEY_QUESTIONS`. Also added `FICHA_HOGAR_QUESTION_COUNT` (learned from spec 007 — never hardcode the question count). US2 appends the remaining 6.
- [X] T008 [US1] Rewrote `src/lib/conversation/phases/phase-4.ts`: new `handleFichaHogar(lead, messageText, callbackData, correlationId)` — loads or creates the lead's `ficha_hogar_profiles` row (`onConflictDoNothing`), resolves the current question via `question_index`, handles button vs free-text capture inline (mirrors `phase-1.ts`'s pattern, not `survey-capture.ts` which is `SURVEY_FIELDS`-bound), includes date-of-birth plausibility validation. **Special-cases question 1**: `conflictOfInterest === true` → `completed_at` set, `transitionLead(..., 'ficha_hogar_descartado', 'ficha_hogar_conflict_of_interest', ...)`, `EXIT_A` sent, return — never reaches `completeFichaHogar()`. Depends on T004, T007.
- [X] T009 [US1] Rewrote `src/lib/conversation/phases/phase-3.ts`'s `handlePhase3Success`: replaced the old immediate `handlePhase4()` call with `handleFichaHogar(lead, '', undefined, correlationId)` (sends question 1, same entry-point pattern `handlePhase1` uses for `/start`). Depends on T008.
- [X] T010 [US1] Added a new branch to `src/lib/conversation/flow-router.ts` for `status === 'code_delivered_registered'` → `handleFichaHogar` — no FAQ-digression check (research.md R7). Depends on T008.
- [X] T011 [US1] Folded into T008 directly — `completeFichaHogar(lead, correlationId)` was written as part of the same rewrite (extracting it after the fact would have meant writing the file twice for no benefit, since the full design was already known).
- [X] T012 [US1] Wrote `tests/e2e/phase-4-discard.spec.ts` (same shallow-smoke pattern as `phase-1-disqualify.spec.ts`): conflict-of-interest "Sí" callback doesn't crash the webhook. Written but **not executed** (needs live dev server + DB — same constraint as every prior spec's e2e tests). Depends on T008, T009, T010.

**Checkpoint**: The discard path is code-complete. `npx tsc --noEmit` clean; `npx vitest run tests/unit` → 102/102 passing, zero regressions. **Still not safe to deploy alone** — see the Dependencies warning: with only T007's single question in the array, a "No" answer would immediately trigger `completeFichaHogar()` with just the discard field answered.

---

## Phase 4: User Story 2 - Cuestionario completo de Ficha Hogar (Priority: P1)

**Goal**: The 6 remaining questions ask/store/correct correctly, in order, after a "No" to conflict-of-interest.

**Independent Test** (per spec.md): complete all 7 questions, confirm all 7 answers are stored.

### Implementation for User Story 2

- [X] T013 [US2] Append the remaining 6 entries to `src/lib/conversation/ficha-hogar-questions.ts` (indices 2-7, per data-model.md's table: `hasInternet` button, `relationshipToHoh` button [5 options], `dateOfBirth` free_text, `hasHealthCondition` button, `unlimitedDataPlan` button, `petCount` free_text). Depends on T007 (appends to the same array — closes the gap noted in US1's checkpoint). **Result**: all 7 questions present in `FICHA_HOGAR_QUESTIONS`.
- [X] T014 [US2] In `handleFichaHogar` (T008), add date-of-birth plausibility validation after extraction: reject (re-prompt without advancing `question_index`) if the parsed date is in the future or implies an implausible age, mirroring the geo-field re-prompt pattern already used in `phase-1.ts`. Depends on T008, T013. **Result**: `isPlausibleBirthDate()` added, with a roundtrip check that catches JS `Date`'s silent month/day rollover (e.g. `new Date(1990,12,15)` → Jan 1991) — found while writing T017's test, not in the original design.
- [X] T015 [US2] Create `src/lib/conversation/ficha-hogar-correction.ts`: a small standalone correction menu (`correctfh:menu` callback prefix, per research.md R3) listing the filled `FICHA_HOGAR_FIELDS`, letting the user pick one to re-answer, then resuming — same UX pattern as `correction.ts`, not a shared implementation. Depends on T004, T013. **Result**: module created with menu/restart/cancel/flow-handler exports.
- [X] T016 [US2] Wire `correctfh:` callbacks into the `code_delivered_registered` branch (T010): route to T015's menu/apply logic instead of `handleFichaHogar` when the callback matches. Depends on T010, T015. **Result**: wired in `flow-router.ts`.
- [X] T017 [US2] Write `tests/unit/ficha-hogar-validation.test.ts`: a future date is rejected, an implausible age (e.g., 200 years) is rejected, a valid past date in range is accepted. Depends on T014. **Result**: 6 tests, all passing. Required mocking `@/lib/env` (in addition to the established `@/lib/db/client` mock) since `phase-4.ts` transitively imports `telegram/send.ts`, which reads `env.TELEGRAM_BOT_TOKEN` eagerly at module load — a second instance of the eager-init anti-pattern already seen in specs 005-007.

**Checkpoint**: All 7 questions work end-to-end; correction works. Combined with US1, this closes the deploy-coupling gap — see Dependencies.

---

## Phase 5: User Story 3 - Resumen AI y persistencia con datos reales de Ficha Hogar (Priority: P2)

**Goal**: The AI summary and Treinta record reflect the newly-captured Ficha Hogar answers, not just Phase 1 data.

**Independent Test** (per spec.md): complete Ficha Hogar with known values, confirm the summary and Treinta record reflect them.

### Implementation for User Story 3

- [X] T018 [US3] Modify `completeFichaHogar()` (T011): load both `survey_profiles` and `ficha_hogar_profiles` for the lead, merge into one object (`{ ...surveyProfile, ...fichaHogarProfile }`), and use the merged object both for the AI summary prompt and as the `profile` argument to `persistTreintaPanelist()` — no changes needed to `persist-panelist.ts` itself, since it already spreads whatever `profile` object it's given into the JSONB blob. Depends on T011, T013 (needs all 7 fields to exist to be meaningful). **Result**: `persistTreintaPanelist`'s `profile` param was already typed `SurveyProfile | Record<string, unknown> | undefined`, so the merged object type-checked with no downstream changes.

**Checkpoint**: Summary and Treinta record include Ficha Hogar data (verified by manual QA sampling per SC-004's own wording — no new automated assertion needed beyond quickstart.md § 4).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 Run `npx vitest run` and `npx tsc --noEmit` (full regression); confirm no new failures beyond the pre-existing ones already documented in specs 004-007. **Result**: 122/122 unit tests pass; 8 e2e spec files fail under vitest (the known pre-existing Playwright-under-vitest category — now includes `phase-1-optin.spec.ts` and `phase-4-discard.spec.ts`, +2 from prior count as expected). `tsc --noEmit` shows only the pre-existing unrelated `src/lib/eval/persist-eval.ts` error (confirmed present on unmodified `main` via stash comparison).
- [X] T020 Execute [quickstart.md](./quickstart.md) §§ 1–5 against a local dev server + DB with migration 0012 applied. **Same constraint as specs 005-007**: requires touching the real Neon DB — needs explicit go-ahead before running. **Result**: ran against the real Neon DB via `scripts/validate-ficha-hogar.ts` (stubs only outbound Telegram HTTP calls; DB writes and the OpenAI summary call are real). Found and fixed a gap: migration `0011_fase1_new_questions.sql` (spec 007) had never been applied live, which crashed `completeFichaHogar()` on the `survey_profiles.age` column — applied it before re-running. All 3 scenarios passed: (1) conflict-of-interest discard → `ficha_hogar_descartado`, 0 Treinta records; (2) full 7-question flow → all fields persisted correctly, invalid future date correctly re-prompted without advancing `question_index`, valid date accepted, lead → `ficha_hogar_completada`, Treinta record created with a coherent AI summary reflecting the real answers; (3) correction menu → lists all 7 filled fields, restarting from a field nulls it and rewinds `question_index`. Two test leads remain in the DB (`999008001` discarded, `999008002` completed) — flagged to user for cleanup decision, same as `TEST-QUOTA-SIMULATION-001` from spec 005.
- [X] T021 [P] Update `docs/WIKI.md` §11 (move Ficha Hogar interactiva + descarte from ❌ Pendiente to ✅ Implementado) and §4/§5 (Fase 4 description, mirroring the pattern already used for specs 004-007's WIKI updates). **Result**: updated §4 (Fase 4 description), §5 (FASE 4 table note), §7.4 (marked ✅ RESUELTO), and §11 (moved from Pendiente to Implementado list).

---

## Dependencies & Execution Order

### ⚠️ Deploy-coupling warning (read before shipping partial work)

**Unlike every prior spec in this project (004-007), there is no safe point to ship only part of this feature.** US1 alone (T007-T012) leaves the questionnaire with exactly 1 question — any lead answering "No" to conflict-of-interest would immediately trigger `completeFichaHogar()` with only that one field answered, generating a premature AI summary and Treinta record. **Treat T002-T018 (Foundational + US1 + US2 + US3) as one atomic release.** This mirrors spec 004's US1/US2 coupling finding, but here it spans all three stories, not two — Phase 4's complete lack of prior interactivity (research.md R1) makes partial rollout structurally unsafe, not just suboptimal.

### Phase Dependencies

- **Setup (T001)**: none.
- **Foundational (T002–T006)**: T002→T003 sequential (migration before schema); T004/T005/T006 are independent of each other and of T003 — different files.
- **US1 (T007–T012)**: needs Foundational. T008 depends on T004+T007; T009/T010/T011 depend on T008; T012 depends on T008-T010.
- **US2 (T013–T017)**: T013 depends on T007 (same array, appends after it). T014 depends on T008+T013 (same file as T008, edits the function it defined). T015 depends on T004+T013. T016 depends on T010+T015. T017 depends on T014.
- **US3 (T018)**: depends on T011 (the function being modified) and T013 (needs all 7 fields to exist for the merge to be meaningful).
- **Polish (T019–T021)**: after everything else.

### Parallel Opportunities

- T004, T005, T006 (Foundational) — three different files, no shared dependency, fully parallel.
- T012 (US1's e2e test) can be written in parallel with T013-T017 (US2) once T008-T010 land — different files.
- T021 (WIKI update) is independent of T019/T020 — parallel.
- Everything else is a tight sequential chain through `ficha-hogar-questions.ts` and `phase-4.ts` — same structural pattern as spec 007's `SURVEY_FIELDS` chain, just shorter (one file pair instead of two arrays).

---

## Parallel Example: Within Foundational

```bash
# Three different files, no shared dependency:
Task: "Update types/lead.ts (T004)"
Task: "Update state-machine/transitions.ts (T005)"
Task: "Update extract-survey-fields.ts (T006)"
```

---

## Implementation Strategy

### MVP scope: everything (T001–T018)

No incremental-deploy option exists for this feature (see the deploy-coupling warning). Build and ship Foundational + US1 + US2 + US3 together, then do Polish.

### Suggested build order (even though it must ship atomically)

1. T001–T006 (Setup + Foundational).
2. T007–T012 (US1) — engine + discard gate. Do not deploy.
3. T013–T017 (US2) — remaining questions + correction. Do not deploy yet — still missing US3.
4. T018 (US3) — real data in the summary/Treinta record. **Now safe to deploy.**
5. T019–T021 (Polish).

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- The real dependency chain to respect: T007→T013 (`ficha-hogar-questions.ts`) and T008→T011→T018 (`phase-4.ts`'s two functions).
- Commit per phase checkpoint, but do not deploy/merge-to-main before T018 lands.
