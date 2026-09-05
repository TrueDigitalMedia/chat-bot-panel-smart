# Quickstart: Validating Mexico Onboarding

Prerequisites: repo installed (`npm install`), `.env` with a Neon dev branch, **feature 014's migration `0029_ecuador_onboarding.sql` applied** (México adds no migration of its own — see research R0).

## 1. Schema check (no migration)

```bash
npm run db:generate           # drizzle-kit: no new migration => schema.ts matches DB (conflict_of_interest / scoring_answers_json / nse_points present)
```

## 2. Unit tests

```bash
npx vitest run tests/unit/mexico-nse.test.ts               # 6-variable point tables + level cutoffs
npx vitest run tests/unit/mexico-nse-catalog.test.ts       # Estado/Municipio → Kantar region
npx vitest run tests/unit/country-config-registry.test.ts  # camConfig + ecuadorConfig + mexicoConfig
npx vitest run tests/unit/survey-plan.test.ts              # resolved question order for México
```

Expected: all green. `country-config-registry` proves CAM **and Ecuador** resolved question lists /
scores are unchanged after adding México.

## 3. CAM + Ecuador regression (zero-diff gate — SC-004, FR-016)

```bash
npx vitest run                       # full unit suite (currently 631 tests)
npm run test:regression              # CAM golden-master (needs POSTGRES_URL); asserts the only snapshot diff is the new "country:México" picker button
npx playwright test tests/e2e        # existing CAM + Ecuador E2E flows (dev server on :3000)
```

Expected: no failures, no snapshot diffs in any CAM or Ecuador questionnaire / scoring / quota test.

## 4. Mexico happy path (E2E)

```bash
npm run db:seed:mexico-quota-example   # open quota_targets + caps for all 12 Kantar regions
npx next dev -p 3000                    # separate terminal
npx playwright test tests/e2e/mexico-onboarding.spec.ts
```

Parts 1–4 drive the México conversation through the live Telegram webhook and assert every turn is
accepted without an unhandled crash. The downstream decision values below are asserted in the unit
suites (`mexico-nse*.test.ts`, `quota-mexico.test.ts`), **not** through the live webhook — its
outbound Telegram sends 400 ("chat not found") for a synthetic chat id and abort each turn before the
decision runs (same structural limit as every e2e spec here):
1. Lead starts, answers Q2 country = **México**.
2. Geo questions use "estado / municipio o alcaldía / colonia" wording plus a "código postal" step;
   answers `Distrito Federal / Iztapalapa` resolve to `nse_region = "AMCM"`, `in_quota_geo = true`.
3. Survey shows the **6 Mexico NSE questions** (escolaridad del jefe/jefa, baños completos,
   automóviles, internet fijo, personas 14+ que trabajaron, cuartos para dormir) — not the CAM or
   Ecuador set.
4. At completion: `leads.nse_points` populated, `leads.quota_segment ∈ {AB, C+, C, D+, D/E}`,
   `leads.score` null. Worked example (Primaria completa / 1 baño / 0 autos / sin internet / 3
   trabajaron / 3 cuartos) → `nse_points = 105`, `quota_segment = "D+"`.
5. With a México `quota_targets` row open for that region+level → `lead_status = 'link_sent'`, Phase 2.
6. Re-run with the region's `quota_region_caps.cap_count` reached → `lead_status = 'quota_exhausted'`.
7. Re-run with `has_baby_under_3 = true` and cap reached → `lead_status = 'link_sent'` (exception).

## 5. Admin tooling

```bash
npm run dev
# /admin/quotas → country selector shows "México"
#   → region dropdown lists the Kantar regions from mexico-nse-regions.json
#   → NSE dimension offers AB / C+ / C / D+ / D/E
#   create a target + a region cap, confirm persistence
# /admin/dashboard → filter country = México → region filter offers the México regions
#   (covered by tests/e2e/admin-mexico-quotas.spec.ts — needs a dev server on :3000 + ADMIN_PASSWORD)
```

## 6. Observability checks (Principle II)

```bash
grep '"event":"nse_score"'   dev.log | jq 'select(.country=="México")'
grep '"event":"geo_resolve"' dev.log | jq 'select(.country=="México")'
grep '"event":"quota_check"'  dev.log | jq 'select(.country=="México")'
```

Expected: `nse_score` shows `points`, `level`, per-variable `contributions`; `geo_resolve` shows
`state_province` / `municipality` / `codigo_postal` and `matched_region`; `quota_check` shows the matched dimension.

## 7. Downstream sync

Confirm the accepted México lead's Panel Smart / TDM synced-answers snapshot carries
`country = "México"` (generic survey-field diff), `nse_region`, `nse_points` (`codigo_pregunta:
'nse_points'`), the NSE `level` (`quota_segment`), and `codigo_postal` (SC-006); the
registration-code request carries `pais_codigo: 'MX'`. Asserted in `src/lib/panel-smart/sync.test.ts`
and `src/lib/tdm-registration/build-request.test.ts`. (The per-member roster is deferred — T003a
Option A — so there is no per-member contact data in 015.)
