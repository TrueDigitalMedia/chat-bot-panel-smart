# Implementation Plan: Mexico Onboarding

**Branch**: `feature/ecuador-mexico` (spec dir `015-mexico-onboarding`) | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-mexico-onboarding/spec.md`

## Summary

Add Mexico as a fully configured recruitment country. Mexico builds directly on the country-configuration
registry introduced by Ecuador (`specs/014-ecuador-onboarding`): the `CountryConfig` interface,
`getCountryConfig()` registry, `survey-plan.ts` (shared prefix + per-country NSE block + shared
suffix), and the `survey_profiles.scoring_answers_json` / `nse_points` columns already exist. Mexico
adds one `mexicoConfig` object plus its data: the AMAI-style **6-variable additive NSE scorer**
(head-of-household schooling, full bathrooms, cars/vans, fixed home internet, household members 14+
who worked last month, rooms used for sleeping), its **Estado → Municipio → Kantar region** catalog,
and a 10-digit phone validator. Every existing country's behavior — CAM/RD and Ecuador — is unchanged.

The socioeconomic-survey / geo / scoring / quota work needs **no new migration** (feature 014's `0015`
already added the columns Mexico needs). Mexico is therefore almost entirely additive data + one
config module + registry and admin-catalog wiring. The one exception is the household-member roster:
the bot has no per-member data model today, so a scoping spike (tasks T003a) decides between deferring
it (migration-free) and a minimal `survey_profiles.household_members jsonb` via migration `0016`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20, Next.js 15 App Router

**Primary Dependencies**: Vercel AI SDK (`ai`), Drizzle ORM, Neon Postgres, Vitest, Playwright

**Storage**: Neon Postgres via Drizzle. **No new migration for the core work** — reuses
`survey_profiles.scoring_answers_json` and `nse_points` from migration `0015` (feature 014). One
migration (`0016_mexico_household_members.sql`) only if the T003a roster spike picks Option B. New
static JSON under `data/geo/` and
`data/scoring/`.

**Testing**: Vitest unit tests (Mexico scoring, Mexico geo resolution, registry entry, survey
assembly); the CAM **and Ecuador** regression suites must pass unchanged; one Playwright E2E for a
Mexico happy path.

**Target Platform**: Vercel serverless (bot webhook handlers) + Next.js admin app.

**Project Type**: Web application — single `src/` tree.

**Performance Goals**: No regression to webhook turn latency; NSE scoring and geo lookup are in-memory
against preindexed catalogs (same pattern as `cam-nse-catalog.ts` / `ecuador-nse-catalog.ts`).

**Constraints**: Zero behavior change for CAM/RD and Ecuador (FR-016); Mexico NSE outputs must match
`docs/mexico/Muestra Regiones NSE Mexico.xlsx` exactly (worked example: 105 → "D+"); no new
conversational LLM surface.

**Scale/Scope**: 1 new country; 6 scoring variables; ~1,900 Estado/Municipio catalog rows across the
Kantar regions; 1 new config module; 2 static data files; registry + admin-catalog wiring; no NSE
call-site changes (already routed through the registry by feature 014). Migration only if the T003a
roster spike picks Option B (`0016`).

**Dependency**: This plan assumes `specs/014-ecuador-onboarding` is implemented (or implemented in the
same branch first). If 015 ships before 014, the registry / `survey-plan.ts` / migration `0015`
groundwork moves into this feature's task list instead — see research R0.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.2.0.

| Principle | Assessment |
|-----------|------------|
| I. AI Safety & Guardrails | PASS with documented note — no new *conversational* LLM surface; `extract-survey-fields.ts` gains México answer-option hints (allowlist-validated on capture). It DOES extend the existing PII-to-LLM extraction path to new México free-text — street address and Código Postal. **If** the T003a roster spike picks Option B, member name/email is also captured — that MUST be structured input, not LLM free-text, so third-party PII never enters a prompt (FR-024). T048/T046 name the fields and document the justification. Existing sanitization / prompt-injection mitigation applies unchanged. See `checklists/meta-compliance.md` CHK026–CHK030, FR-024, tasks T003a/T046/T048. |
| II. Observability First | PASS (with work) — reuses the `nse_score` and `geo_resolve` structured logs added by feature 014, now emitting `country: "México"`. Quickstart documents the queries. |
| III. Simplicity / YAGNI | PASS — no new abstraction. Mexico is the second consumer of the registry the constitution (Principle V) and feature 014 already established; it is pure configuration + data. The AMAI scorer is a data-driven variant of the same additive-points shape as Ecuador. |
| IV. Flexible Quota Eligibility | PASS — quota engine unchanged; Mexico leads feed their NSE level ("AB"/"C+"/"C"/"D+"/"D/E") as `segment`. Pregnancy/baby exception, per-region caps, OR-dimension matching all apply via existing `checkQuotaAvailability`. Mexico `quota_targets` / `quota_region_caps` rows are data. |
| V. Country-Scoped Recruitment Configuration | PASS — Mexico is added as one `CountryConfig` + two data files. The only country-name branch stays in `getCountryConfig()`. CAM **and Ecuador** regression suites prove other markets unchanged. |

No violations. Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/015-mexico-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── mexico-nse-scoring.md
│   └── mexico-geo-catalog.md
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
src/lib/countries/
├── types.ts                           # UNCHANGED (from feature 014)
├── registry.ts                        # MODIFIED — add 'México' → mexicoConfig
├── cam.ts                             # UNCHANGED
├── ecuador.ts                         # UNCHANGED (from feature 014)
└── mexico.ts                          # NEW — Mexico config: scoring block, computeNse, geo resolver, phone

src/lib/scoring/
├── socioeconomic.ts                   # UNCHANGED
├── ecuador-nse.ts                     # UNCHANGED
└── mexico-nse.ts                      # NEW — AMAI-style 6-variable additive scorer (data-driven)

src/lib/geo/
├── cam-nse-catalog.ts                 # UNCHANGED
├── ecuador-nse-catalog.ts             # UNCHANGED
└── mexico-nse-catalog.ts              # NEW — Estado / Municipio → Kantar region resolver

src/lib/conversation/
├── survey-plan.ts                     # MODIFIED — add Mexico NSE block to the per-country switch
├── survey-questions.ts                # MODIFIED — add Mexico NSE SurveyQuestion objects
└── phases/phase-1.ts, geo/handle-confirm.ts   # UNCHANGED (already call getCountryConfig().computeNse)

src/lib/ai/extract-survey-fields.ts    # MODIFIED — Mexico answer-option extraction hints
src/lib/geo/reverse-geocode.ts / canonical-country   # MODIFIED — "México"/"Mexico"/"MX" → "México"
src/lib/quotas/ (admin catalog helpers) # MODIFIED — Mexico in country + region + NSE-level lists

data/geo/mexico-nse-regions.json       # NEW — Estado/Municipio → REGION / Region Kantar / ESTRATO
data/scoring/mexico-nse.json           # NEW — 6 variable point tables + level cutoffs (from the xlsx)

tests/unit/mexico-nse.test.ts                  # NEW
tests/unit/mexico-nse-catalog.test.ts          # NEW
tests/unit/country-config-registry.test.ts     # MODIFIED — add Mexico cases (+ CAM/EC still green)
tests/unit/survey-plan.test.ts                 # MODIFIED — Mexico resolved order
tests/e2e/mexico-onboarding.spec.ts            # NEW (Playwright)
```

**Structure Decision**: Single `src/` web-app tree. No new module namespace — Mexico slots into the
`src/lib/countries/` registry created by feature 014, next to `ecuador.ts`. Two static data files; a
migration (`0016`) only under roster-spike Option B.

## Phase 0: Research

See [research.md](./research.md). Open items resolved there:

- R0. Sequencing vs. feature 014 (shared registry / `survey-plan.ts` / migration `0015`).
- R1. Mexico NSE point tables + level cutoffs (transcribe & lock from the xlsx; worked example 105 → "D+").
- R2. Education variable = **head/jefa of household**, single answer (no max-of-two, unlike Ecuador).
- R3. Kantar region set and the Estado/Municipio resolution key; role of ESTRATO (carried, not keyed).
- R4. Finer AMAI 7-level table — **not used**; store `nse_points`, expose the 5-band collapsed level.
- R5. Handling a scoring total below the workbook's minimum (6) from missing answers → floor to "D/E".
- R6. Canonical country name / detection ("México"), Código Postal + Colonia capture, CP→Municipio.
- R7. Mexico phone format (10 digits) and interaction with `resolveWhatsAppPhone` / BSUID guard.
- R8. Per-member personal phone/email in the México roster — **no per-member data model exists today**;
  a scoping spike (tasks T003a) decides defer (default) vs. a minimal `household_members jsonb` +
  migration `0016`.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — `scoring_answers_json` key set for México, `mexicoConfig` shape,
  México catalog & point-table record shapes, `quota_targets` México rows, resolved-survey structure,
  the household-roster spike (T003a) and its optional `0016` migration, observability, downstream sync.
- [contracts/mexico-nse-scoring.md](./contracts/mexico-nse-scoring.md) — inputs, per-variable point
  tables, total, level cutoffs, worked example (105 → "D+"), missing-answer / floor rule.
- [contracts/mexico-geo-catalog.md](./contracts/mexico-geo-catalog.md) — catalog file schema,
  resolution algorithm (normalize → Estado + Municipio → Kantar region), CP fallback, out-of-quota
  behavior.
- [quickstart.md](./quickstart.md) — run the Mexico scoring/geo unit tests, the CAM + Ecuador
  regression suites, the Playwright Mexico happy path; the log queries that prove observability.

**Agent context update**: no `CLAUDE.md` / agent-guidance file and no `update-agent-context` script in
`.specify/scripts/bash/`; nothing to update. The "country config, not country branches" rule and the
`src/lib/countries/` registry are already the standing convention from feature 014.

### Post-design Constitution re-check

Unchanged — all five principles still PASS. Mexico introduces no new abstraction, no new country
branch outside `getCountryConfig()`, reuses feature 014's observability, and leaves CAM/RD and Ecuador
code paths untouched.

## Complexity Tracking

Not required — no constitution violations.
