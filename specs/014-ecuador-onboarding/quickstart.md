# Quickstart: Validating Ecuador Onboarding

Prerequisites: repo installed (`npm install`), `.env` with a Neon dev branch, migration `0015`
applied to that branch.

## 1. Apply the migration

```bash
npm run db:migrate            # applies src/lib/db/migrations/0015_ecuador_onboarding.sql
npm run db:check              # drizzle: schema.ts matches DB
```

Expected: `survey_profiles` has `scoring_answers_json`, `nse_points`.

## 2. Unit tests

```bash
npx vitest run tests/unit/ecuador-nse.test.ts               # point tables + level cutoffs
npx vitest run tests/unit/ecuador-nse-catalog.test.ts       # Provincia/Cantón/Parroquia → Región
npx vitest run tests/unit/country-config-registry.test.ts   # camConfig back-compat (BLOCKING)
npx vitest run tests/unit/survey-plan.test.ts               # resolved question order per country
```

Expected: all green. `country-config-registry` proves `resolveSurveyQuestions('Guatemala')` etc.
deep-equal today's `SURVEY_QUESTIONS` and CAM scores are unchanged.

## 3. CAM regression (zero-diff gate — SC-004, FR-016)

```bash
npx vitest run                       # full unit suite
npx playwright test tests/e2e        # existing CAM E2E flows
```

Expected: no failures, no snapshot diffs in any CAM questionnaire / scoring / quota test.

## 4. Ecuador happy path (E2E)

```bash
npx playwright test tests/e2e/ecuador-onboarding.spec.ts
```

Scenario asserted:
1. Lead starts, answers Q2 country = **Ecuador**.
2. Geo questions use "provincia / cantón / parroquia" wording; answers `Guayas / Guayaquil / Tarqui`
   resolve to `nse_region = "Guayaquil Norte"`, `in_quota_geo = true`.
3. Survey shows the **8 Ecuador NSE questions** (health insurance … internet), not the CAM set.
4. At completion: `leads.nse_points` populated, `leads.quota_segment ∈ {AB, C, D/E}`,
   `leads.score` null.
5. With an Ecuador `quota_targets` row open for that region+level → `lead_status = 'link_sent'` and
   Phase 2 begins.
6. Re-run with the region's `quota_region_caps.cap_count` reached → `lead_status = 'quota_exhausted'`.
7. Re-run with `is_pregnant = true` and cap reached → `lead_status = 'link_sent'` (exception).

## 5. Admin tooling

```bash
npm run dev
# visit /admin/quotas → country selector shows "Ecuador"
#   → region dropdown lists the 12 Ecuador regions
#   → NSE dimension offers AB / C / D/E
#   create a target + a region cap, confirm they persist
# visit /admin/leads → filter country = Ecuador → only Ecuador leads; region filter = Ecuador regions
```

## 6. Observability checks (Principle II)

After running the E2E flow, in the dev logs:

```bash
grep '"event":"nse_score"'   dev.log | jq 'select(.country=="Ecuador")'
grep '"event":"geo_resolve"' dev.log | jq 'select(.country=="Ecuador")'
grep '"event":"quota_check"'  dev.log | jq 'select(.country=="Ecuador")'
```

Expected: `nse_score` shows `points`, `level`, and per-variable `contributions`; `geo_resolve` shows
the provincia/cantón/parroquia and `matched_region`; `quota_check` shows the matched dimension.

## 7. Downstream sync

Confirm the accepted Ecuador lead's Panel Smart / TDM synced-answers snapshot carries
`country = "Ecuador"`, `nse_region`, and the NSE `level` (SC-006).
