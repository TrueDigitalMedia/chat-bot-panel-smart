# Implementation Plan: Ecuador Onboarding

**Branch**: `feature/ecuador-mexico` (spec dir `014-ecuador-onboarding`) | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-ecuador-onboarding/spec.md`

## Summary

Add Ecuador as a fully configured recruitment country alongside the seven CAM/RD markets. The bot
currently hard-codes one questionnaire (`SURVEY_QUESTIONS`), one socioeconomic instrument
(`scoring/socioeconomic.ts`, the SCL-CAM formula) and one geo catalog (`data/geo/cam-nse-regions.json`).
Ecuador needs its own questionnaire wording, its own 8-variable additive NSE point system, its own
Provincia→Cantón→Parroquia(→Parroquia Urbana) geo catalog, and its own phone format — while every
existing country's behavior stays byte-for-byte identical.

Technical approach: introduce a **country-configuration registry** (`src/lib/countries/`). Each country
resolves to a `CountryConfig` that supplies (a) the socioeconomic question block, (b) an
`computeNse(answers) → { points, level }` function, (c) geo-hierarchy labels + an NSE-region resolver,
and (d) phone validation. The CAM/RD countries share one `camConfig` that wraps the *existing*
functions unchanged; Ecuador adds `ecuadorConfig` backed by new static data files. The two NSE call
sites (`phases/phase-1.ts`, `geo/handle-confirm.ts`) and the survey-question sender route through the
registry instead of importing the CAM functions directly. Survey-profile scoring answers that are
country-specific are stored in a `scoring_answers_json` column plus a `nse_points` column; the existing
`quota_segment` column now holds the country's NSE level ("AB" / "C" / "D/E" for Ecuador). The quota
engine (`scoring/quota.ts`) and admin quota tooling are already country-scoped and need only Ecuador
catalog/level data, not logic changes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20, Next.js 15 App Router

**Primary Dependencies**: Vercel AI SDK (`ai`), Drizzle ORM, Neon Postgres, Vitest, Playwright

**Storage**: Neon Postgres via Drizzle. New migration `0015_ecuador_onboarding.sql`. New static JSON
data under `data/geo/` and `data/scoring/`.

**Testing**: Vitest unit tests (scoring, geo resolution, config registry, survey assembly); existing
CAM regression suites must pass unchanged; Playwright E2E for one Ecuador happy path.

**Target Platform**: Vercel serverless (bot webhook handlers) + Next.js admin app.

**Project Type**: Web application (conversational bot backend + admin dashboard) — single `src/` tree.

**Performance Goals**: No regression to webhook turn latency; NSE scoring and geo lookup remain
in-memory O(1)/O(log n) against preindexed catalogs (same pattern as `cam-nse-catalog.ts`).

**Constraints**: Zero behavior change for existing countries (FR-016); NSE outputs must match
`docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` exactly; no new conversational LLM surface.

**Scale/Scope**: 1 new country; ~8 scoring variables; ~1,000 Ecuador parroquia catalog rows;
~12 Ecuador NSE regions; 2 NSE call sites refactored; 1 migration; ~6 new source modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.2.0.

| Principle | Assessment |
|-----------|------------|
| I. AI Safety & Guardrails | PASS with documented note — no new *conversational* LLM surface; `extract-survey-fields.ts` gains Ecuador answer-option hints (allowlist-validated on capture). It DOES extend the existing PII-to-LLM extraction path to new Ecuador free-text fields — the **full street address** and any income/education free-text. This is the same mechanism already used for CAM name/email/geo free-text; the incremental PII is the Ecuador address. Justification + the field list are recorded per FR-024 (spec Compliance Requirements); existing sanitization / prompt-injection mitigation applies unchanged. See `checklists/meta-compliance.md` CHK025–CHK029 and tasks T055. |
| II. Observability First | PASS (with work) — plan adds structured logs: `nse_score` (country, points, level, per-variable contributions) and `geo_resolve` (country, provincia/cantón/parroquia, matched region or miss). Reuses existing `quota_check` log. Quickstart documents the log queries. |
| III. Simplicity / YAGNI | PASS — the country-config registry is a new abstraction, justified: two concrete countries (Ecuador now, Mexico in `015`) both need per-country questionnaire + scoring + geo, and Principle V forbids scattered `if (country === …)` branches. The CAM path is wrapped, not rewritten. No speculative extension points beyond what EC + MX require. |
| IV. Flexible Quota Eligibility | PASS — quota engine unchanged; Ecuador leads feed their NSE level as `segment`. Pregnancy/baby exception, per-region caps, and OR-dimension matching all apply via existing `checkQuotaAvailability`. Ecuador `quota_targets` / `quota_region_caps` rows are data. |
| V. Country-Scoped Recruitment Configuration | PASS — this feature is the first realization of Principle V. NSE scoring, questionnaire content, geo catalog, phone validation, and screening are Ecuador-specific data + one `CountryConfig` object; shared code paths (`survey-plan.ts`, `phase-1.ts`, `gps-capture.ts`, `handle-confirm.ts`, `quota-targets.ts`, `region-caps.ts`, admin quota/dashboard pages) get a `getCountryConfig()` lookup, not a country branch. Post-country-selection phone re-validation (T021) goes through `getCountryConfig(country).validatePhone` — no `=== 'Ecuador'` literal. CAM regression suite proves other markets unchanged. **T048 self-review** found two pre-existing deviations *not* introduced by this feature, both documented in `docs/countries.md` and tracked for follow-up: `isGuatemala` geo-validation gates in `phase-1.ts`/`survey-capture.ts` (spec 002-era), and `makeCamConfig`'s name switch for Costa Rica/Guatemala `geoHierarchy` (inside the `countries/` config-assembly module). |

No new violations (see T048 note above re: pre-existing Guatemala gates). Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/014-ecuador-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── country-config.md
│   ├── ecuador-nse-scoring.md
│   └── ecuador-geo-catalog.md
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
src/lib/countries/                     # NEW — country-configuration registry
├── types.ts                           #   CountryConfig, NseResult, GeoHierarchy interfaces
├── registry.ts                        #   getCountryConfig(country) → CountryConfig
├── cam.ts                             #   wraps existing scoring/socioeconomic.ts + cam-nse-catalog.ts
└── ecuador.ts                         #   Ecuador config: scoring block, computeNse, geo resolver, phone

src/lib/scoring/
├── socioeconomic.ts                   # UNCHANGED (CAM formula)
└── ecuador-nse.ts                     # NEW — additive point scorer + level cutoffs (data-driven)

src/lib/geo/
├── cam-nse-catalog.ts                 # UNCHANGED
└── ecuador-nse-catalog.ts             # NEW — Provincia/Cantón/Parroquia(/Urbana) → Región resolver

src/lib/conversation/
├── survey-questions.ts                # MODIFIED — split into shared prefix/suffix + per-country NSE block
├── survey-plan.ts                     # NEW — resolveSurveyQuestions(country) → ordered SurveyQuestion[]
├── send-survey-question.ts            # MODIFIED — pull question list from survey-plan, not the static array
└── phases/phase-1.ts                  # MODIFIED — NSE via getCountryConfig(country).computeNse(...)

src/lib/geo/handle-confirm.ts          # MODIFIED — same NSE call-site swap as phase-1
src/lib/ai/extract-survey-fields.ts    # MODIFIED — Ecuador answer-option extraction hints
src/lib/db/schema.ts                   # MODIFIED — survey_profiles: scoring_answers_json, nse_points
src/lib/db/migrations/0015_ecuador_onboarding.sql   # NEW
src/lib/quotas/ (admin catalog helpers) # MODIFIED — Ecuador in country + region + NSE-level lists

data/geo/ecuador-nse-regions.json      # NEW — region catalog (from the xlsx)
data/scoring/ecuador-nse.json          # NEW — 8 variable point tables + level cutoffs (from the xlsx)

tests/unit/ecuador-nse.test.ts                 # NEW
tests/unit/ecuador-nse-catalog.test.ts         # NEW
tests/unit/country-config-registry.test.ts     # NEW
tests/unit/survey-plan.test.ts                 # NEW
tests/unit/cam-regression-*.test.ts            # existing — must stay green
tests/e2e/ecuador-onboarding.spec.ts           # NEW (Playwright)
```

**Structure Decision**: Single `src/` web-app tree (existing). The feature adds one new module
namespace (`src/lib/countries/`) and country-scoped siblings next to the existing CAM files, plus two
static data files. No new project or service.

## Phase 0: Research

See [research.md](./research.md). Open items resolved there:

1. Ecuador NSE point tables + level cutoffs (transcribe & lock from the xlsx; confirm 76+ → "AB").
2. "Máxima Ocupación del jefe y/o ama" — single occupation vs. max(head, ama). **Decision: take the
   higher point value of the two when both are known** (spec assumption confirmed).
3. Parroquia-urbana granularity for Guayaquil / Quito regions — how to resolve when only Cantón is
   known. **Decision: ask the parroquia question once; if still unresolved, mark out of geographic
   quota** (spec assumption confirmed).
4. Whether to keep the finer A/B/C/D/E table. **Decision: store `nse_points` and the 3-band level;
   expose only the 3-band level to quota.**
5. Survey-question indexing model with a variable-length per-country block (stable `surveyQuestionIndex`).
6. Storage shape for country-specific scoring answers (`scoring_answers_json` jsonb vs. per-variable
   columns). **Decision: jsonb + `nse_points`, so Mexico (`015`) adds no columns.**
7. Ecuador phone format (10 digits = 3 area + 7 local) and how it interacts with existing
   `resolveWhatsAppPhone` / BSUID handling.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — `survey_profiles` new columns, `CountryConfig` shape, Ecuador
  catalog & point-table record shapes, `quota_targets` Ecuador rows, migration outline, state/flow
  notes for the variable-length survey block.
- [contracts/country-config.md](./contracts/country-config.md) — the `CountryConfig` /
  `getCountryConfig` interface every country (CAM wrapper + Ecuador) implements.
- [contracts/ecuador-nse-scoring.md](./contracts/ecuador-nse-scoring.md) — inputs, per-variable point
  tables, total, level cutoffs, worked example (total 52 → "C"), missing-answer rule.
- [contracts/ecuador-geo-catalog.md](./contracts/ecuador-geo-catalog.md) — catalog file schema,
  resolution algorithm (normalize → Provincia+Cantón+Parroquia → Región; Guayaquil/Quito via Parroquia
  Urbana), out-of-quota behavior.
- [quickstart.md](./quickstart.md) — how to run the Ecuador scoring/geo unit tests, the CAM regression
  suite, and the Playwright Ecuador happy path; the log queries that prove observability.

**Agent context update**: repo has no `CLAUDE.md` / agent guidance file and no `update-agent-context`
script under `.specify/scripts/bash/`; nothing to update. If one is added later, record the
`src/lib/countries/` registry and the "country config, not country branches" rule.

### Post-design Constitution re-check

No change from the pre-design assessment — all five principles still PASS. The design keeps the
country branch in exactly one place (`registry.ts`), adds the required observability logs, and leaves
the CAM code path untouched.

## Complexity Tracking

Not required — no constitution violations.
