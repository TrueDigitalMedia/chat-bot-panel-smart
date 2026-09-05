# Quickstart: Validating Ecuador Onboarding

Prerequisites: repo installed (`npm install`), `.env` with a Neon dev branch, migration
`0029_ecuador_onboarding.sql` applied to that branch.

## 1. Apply the migration

```bash
npm run db:migrate            # applies src/lib/db/migrations/0029_ecuador_onboarding.sql
npm run db:generate           # drizzle-kit: no new migration emitted => schema.ts matches DB
```

Expected: `survey_profiles` has `conflict_of_interest`, `scoring_answers_json`, `nse_points`;
`npm run db:generate` reports "No schema changes".

## 2. Unit tests

```bash
npx vitest run tests/unit/ecuador-nse.test.ts               # point tables + level cutoffs
npx vitest run tests/unit/ecuador-nse-catalog.test.ts       # Provincia/Cantón/Parroquia → Región
npx vitest run tests/unit/country-config-registry.test.ts   # camConfig back-compat (BLOCKING)
npx vitest run tests/unit/survey-plan.test.ts               # resolved question order per country
npx vitest run tests/unit/quota-ecuador.test.ts             # quota decision for country='Ecuador'
```

Expected: all green. `country-config-registry` proves `resolveSurveyQuestions('Guatemala')` etc.
deep-equal today's CAM question list and CAM scores are unchanged.

## 3. CAM regression (zero-diff gate — SC-004, FR-016)

```bash
npx vitest run                       # full unit suite (currently 506 tests)
npm run test:regression              # CAM golden-master (needs POSTGRES_URL); asserts zero snapshot diff
npx playwright test tests/e2e        # existing CAM E2E flows (needs a dev server on :3000)
```

Expected: no failures, no snapshot diffs in any CAM questionnaire / scoring / quota test.

> Note: the Playwright suite's `webServer` config expects port 3000; `npm run dev` uses 4000.
> Run `npx next dev -p 3000` in a separate terminal, or adjust `playwright.config.ts` locally.

## 4. Ecuador flow (E2E webhook smoke — `tests/e2e/ecuador-onboarding.spec.ts`)

```bash
npm run db:seed:ecuador-quota-example   # open quota_targets + region caps for all 12 Ecuador regions
npx next dev -p 3000                     # separate terminal
npx playwright test tests/e2e/ecuador-onboarding.spec.ts
```

Parts 1–4 drive the Ecuador conversation through the live Telegram webhook and assert every turn
is accepted without an unhandled crash:

1. Q2 country = **Ecuador** → the next question is Ecuador's conflict-of-interest screening.
2. Geo questions use "provincia / cantón / parroquia" wording.
3. The **8 Ecuador NSE questions** (health insurance … internet) are all accepted, not the CAM set.
4. Part 4 seeds the open-target / cap-reached / pregnancy-exception quota scenarios and drives each
   journey.

The downstream decision values these journeys would produce — `nse_region = "Guayaquil Norte"`,
`in_quota_geo`, `leads.nse_points`, `leads.quota_segment ∈ {AB, C, D/E}`, `leads.score` null,
`link_sent` vs `quota_exhausted`, the pregnancy exception — are asserted in the unit suites
(`ecuador-nse.test.ts`, `ecuador-nse-catalog.test.ts`, `quota-ecuador.test.ts`,
`quota-targets.test.ts`) and the CAM regression harness's methodology, **not** through the live
webhook: its outbound Telegram sends 400 ("chat not found") for a synthetic chat id and abort each
turn's processing before the decision runs — the structural reason every e2e spec in this repo is a
webhook-status smoke test.

## 5. Admin tooling

```bash
npm run dev
# visit /admin/quotas → country selector shows "Ecuador"
#   → region dropdown lists the 12 Ecuador regions
#   → NSE dimension offers AB / C / D/E (after selecting Ecuador)
#   create a target + a region cap, confirm they persist
# visit /admin/dashboard → country filter shows "Ecuador" → region filter offers the Ecuador regions
```

Covered by `tests/e2e/admin-ecuador-quotas.spec.ts` (needs a dev server on :3000 + `ADMIN_PASSWORD`).

## 6. Observability checks (Principle II)

After running an Ecuador flow, in the dev logs:

```bash
grep '"event":"nse_score"'   dev.log | jq 'select(.country=="Ecuador")'
grep '"event":"geo_resolve"' dev.log | jq 'select(.country=="Ecuador")'
grep '"event":"quota_check"'  dev.log | jq 'select(.country=="Ecuador")'
```

Expected: `nse_score` shows `points`, `level`, and per-variable `contributions`; `geo_resolve` shows
`path`, `country`, `state_province`, `municipality`, `neighborhood` (the parroquia, or null on the GPS
path / for CAM), and `matched_region`; `quota_check` shows `country`, `region`, `segment`, and the
matched dimension.

## 7. Downstream sync

The accepted Ecuador lead's Panel Smart / TDM synced-answers snapshot carries `country = "Ecuador"`
(via the generic survey-field diff), `nse_region`, `nse_points` (`codigo_pregunta: 'nse_points'`),
and the NSE `level` (`quota_segment`); its registration-code request carries `pais_codigo: 'EC'`.
Asserted in `src/lib/panel-smart/sync.test.ts` and `src/lib/tdm-registration/build-request.test.ts`
(SC-006).
