# CAM Regression Analysis — Features 014 (Ecuador) & 015 (Mexico)

**Status**: Plan + harness scaffold
**Owner**: (assign)
**Applies to**: `feature/ecuador-mexico` branch
**Gate for**: `specs/014-ecuador-onboarding` FR-016 / SC-004, `specs/015-mexico-onboarding` FR-016 / SC-004

## 1. Why

Features 014 and 015 refactor code paths that **every existing CAM/RD country shares**:

| Change (from the plans) | CAM risk |
|-------------------------|----------|
| `survey-questions.ts` split into `SHARED_PREFIX` / NSE block / `SHARED_SUFFIX` (014 T009) | question wording, order, or count drifts for CAM |
| `resolveSurveyQuestions(country)` replaces the static `SURVEY_QUESTIONS` array (014 T010) | advance paths / `SURVEY_QUESTION_COUNT` behave differently |
| `send-survey-question.ts` geo wording moves from inline `if (country===…)` into `geoHierarchy` (014 T011) | Guatemala zona wording, Costa Rica "cantón" wording regress |
| `getCountryConfig(country).computeNse(...)` replaces direct `calculateScore` / `getQuotaSegment` imports (014 T013) | SCL-CAM score or `quota_segment` changes |
| screening / conflict-of-interest list moves into `CountryConfig.screeningIndustries` (014 T020) | CAM disqualification wording / logic regress |
| `questionIndexForField` becomes country-aware (014 T012) | correction flow jumps to the wrong question for CAM |
| `canonicalCountry` gains Ecuador / Mexico entries (014 T026, 015 T007) | a CAM GPS reverse-geocode maps differently |
| admin `listCatalogCountries` / `listNseRegionsForCountry` become multi-source (014 T040, 015 T033) | CAM country/region lists in the admin UI change |

Unit tests cover pieces of this, but nothing today asserts that a **whole CAM conversation** —
message in → bot turns out → final DB state — is unchanged end to end.

## 2. Approach: golden-master (characterization) test

A **before/after snapshot** test:

1. **Before** (on `main`, or the branch point, *before* any 014/015 code): run the harness against a
   set of scripted CAM journeys. It records, per journey, a deterministic snapshot of:
   - the ordered outbound transcript (every bot message: text + button `callback_data` list + type),
   - the final `leads` row (status, phase, `survey_question_index`, `score`, `quota_segment`,
     `quota_matched_dimension`, `quota_matched_value`),
   - the final `survey_profiles` row (all captured answers, `nse_region`, `in_quota_geo`).
   Snapshots are committed to `tests/regression/__snapshots__/`.
2. **After** (on `feature/ecuador-mexico`, with 014 + 015 implemented): run the same harness. **Any
   snapshot diff fails the build.** A diff is either a real CAM regression (fix the code) or an
   intentional, reviewed change (update the snapshot in the same PR with a written justification).

This is the standard "pin current behavior, then refactor under it" technique. The snapshots are not
"correct answers" — they are "what CAM does today", which is exactly what FR-016 says must not move.

## 3. Test boundary (what runs, what is mocked)

Runs **in-process under Vitest** (not Playwright — no dev server, no real Telegram), calling the real
turn entrypoint `routeMessage(lead, inbound, correlationId)` from `src/lib/conversation/flow-router.ts`.

**Real** (not mocked):
- The entire conversation domain: `flow-router`, `phases/*`, `survey-*`, `geo/*`, `scoring/*`,
  `quotas/*`, `state-machine`, `correction`.
- A **real Postgres** (a disposable Neon test branch / local PG). Migrations applied. Each journey runs
  with its own fresh `channelUserId`; a `beforeEach` truncates the per-lead tables.
- `quota_targets` / `quota_region_caps` — seeded from a fixture so quota decisions are deterministic.

**Mocked** (deterministic stubs, set up in `cam-harness.ts`):
- `@/lib/telegram/send` and `@/lib/whatsapp/send` — capture every outbound call into an array instead
  of calling an API. This is the transcript source.
- `@/lib/ai/extract-survey-fields` `extractField` — returns a scripted value per field name from the
  journey definition (no LLM call). Free-text fields (name, email, provincia, municipio, age,
  shoppingCategories) are scripted; button fields already bypass extraction.
- `@/lib/ai/sanitize` / `context-guard` / `validate-output` — pass-through (no LLM).
- Any outbound HTTP in Phase 2+ (`@/lib/tdm-registration/*`, `@/lib/panel-smart/*`) — stubbed to a
  fixed success so `link_sent` / registration snapshots are stable. Set
  `REGISTRATION_CODE_MOCK_ENABLED=true` in the test env as the first line of defense.
- `@/lib/scheduler/*` (QStash) — no-op.
- Time: freeze `Date.now()` with `vi.setSystemTime` so `created_at`/`updated_at` are excluded anyway,
  but re-engagement math stays put.

**Snapshot hygiene**: the serializer strips `id`, `leadId`, all timestamps, `correlationId`, and any
UUID before `toMatchSnapshot()`, so only behavior-bearing fields are compared.

## 4. Journey matrix (CAM only)

Each journey is a named list of inbound turns (`text` or `callbackData`) + a scripted `extractField`
map. Author them so the snapshot exercises the risk in §1.

| # | Journey | Country | Exercises |
|---|---------|---------|-----------|
| C1 | Full qualify, generic geo | Panamá | 19-Q survey order/wording, SCL-CAM score, quota NSE match, `link_sent` |
| C2 | Full qualify, Guatemala geo catalog | Guatemala | `geoHierarchy` zona/barrio wording, Guatemala validation, score |
| C3 | Full qualify, "cantón" wording | Costa Rica | Costa Rica Q4 wording special-case moved to `geoHierarchy` |
| C4 | Decline T&C at D1 | Honduras | early terminal path, `not_qualified` |
| C5 | Conflict of interest / sensitive industry | El Salvador | screening list moved to `CountryConfig.screeningIndustries` |
| C6 | Survey completes, no quota cell | Nicaragua | `quota_exhausted`, `getQuotaSegment` banding, EXIT_B messages |
| C7 | Pregnancy exception | Panamá | `checkQuotaAvailability` exception attribution unchanged for CAM |
| C8 | GPS share resolves inside catalog | Guatemala | `canonicalCountry` + `lookupNseRegion` for a CAM country, GPS gate |
| C9 | GPS share outside catalog → manual entry | Honduras | GPS-out fallback, `in_quota_geo=false` path |
| C10 | Mid-survey geo correction | Costa Rica | `questionIndexForField` country-aware jump target |
| C11 | Manual municipality, allowlist hit + miss | Rep. Dominicana | `applyManualMunicipalityAllowlist`, `nse_region` set/null |

C1–C7 are the MVP set (cover score + survey + quota + screening). C8–C11 add geo-path coverage.

## 5. Before/after procedure

```bash
# ---- BEFORE (branch point, no 014/015 code) ----
git switch feature/ecuador-mexico
git switch -c chore/cam-regression-baseline <commit-before-014>   # or just main
# add tests/regression/** + package.json scripts (this commit only — no src/ changes)
POSTGRES_URL=<test-branch> npm run db:migrate
npm run test:regression:update        # writes tests/regression/__snapshots__/*
git add tests/regression && git commit -m "test: CAM regression baseline snapshots (pre-014/015)"
# merge this commit to the feature branch so the baseline travels with the work

# ---- AFTER (014 + 015 implemented on the branch) ----
POSTGRES_URL=<test-branch> npm run db:migrate
npm run test:regression                # MUST pass with zero snapshot changes
```

CI: add a `test:regression` job to the `feature/ecuador-mexico` branch protection. It runs
`npm run test:regression` (not `-u`) and fails on any diff. `git diff --exit-code tests/regression/__snapshots__`
as a belt-and-suspenders step.

If a diff is intentional (e.g. a deliberate wording fix): update the snapshot in the same PR, and the
PR description must state which journey changed and why it is not an FR-016 violation.

## 6. Relationship to the feature task lists

- **014 T016** ("Run the full existing unit + e2e suite … zero diffs") is upgraded: it now also means
  `npm run test:regression` is green after Phase 2.
- **014 T045 / 015 T038** (Polish) explicitly run `npm run test:regression`.
- New shared tasks (added to both `tasks.md` — 014 owns building it, 015 owns re-running it):
  - **014 T004a** *(Setup)* — add `tests/regression/**` harness + journeys + `package.json` scripts on
    a src-clean commit; capture baseline snapshots; land on the branch.
  - **014 T016a** *(end of Phase 2)* — `npm run test:regression` green after the registry/survey-plan
    refactor.
  - **015 T009a** *(end of Phase 2)* — `npm run test:regression` green after Mexico is registered.
  - **014 T053a** *(infra, run right after T004a/T016a)* — extend the harness for the **WhatsApp
    channel**: `@/lib/whatsapp/send` capture mock, `channel: 'whatsapp'` in the runner, the
    `pending_wa_choices` numbered-button-fallback path, and 1–2 CAM WhatsApp golden-master journeys
    with baseline snapshots. `015 T046a` verifies/reuses it. Consumed by `014 T054` and `015 T047`
    (the per-country WhatsApp journeys).

## 7. Files

```text
tests/regression/
├── cam-harness.ts              # mocks, DB reset, journey runner, snapshot serializer
├── cam-journeys.ts             # the C1–C11 journey definitions (inbound turns + scripted extractions)
├── cam-golden-master.test.ts   # one `it()` per journey → toMatchSnapshot()
├── __snapshots__/              # committed baseline (generated)
└── README.md                   # run instructions (mirrors §5)
```

The harness scaffold and a reference journey (C1) are committed with this doc. The remaining journeys
are filled in during 014 T004a — each is ~15 lines of turn script.

## 8. Limitations / non-goals

- Not a load/perf test. Not a UI test of the admin app (covered by 014 T043 / 015 T036 Playwright).
- LLM extraction is stubbed, so this does not catch prompt regressions — that is deliberate; prompt
  behavior for CAM is out of 014/015 scope and separately owned.
- **Telegram** is the primary channel for the C1–C11 journeys. **WhatsApp** channel coverage is added
  by 014 T053a (harness extension + 1–2 CAM WhatsApp journeys) so the per-country WhatsApp content in
  014/015 can be regression-checked (FR-023/FR-025). The **web** channel is not snapshotted here — it
  shares the domain layer, so a CAM regression surfaces via the Telegram journeys; feature 016's
  `survey-plan.ts` change is proven a no-op by re-running this suite, and 016's bare-`/chat` "still
  asks country" behavior is checked by a Playwright E2E, not a golden-master journey.
