# CAM regression suite

Golden-master / characterization tests that pin **current CAM conversation behavior** so the
Ecuador (014) and Mexico (015) work can be proven not to change it (FR-016 / SC-004).

Full design: [`specs/regression/cam-regression-analysis.md`](../../specs/regression/cam-regression-analysis.md).

## What it does

Drives whole CAM conversations in-process through `routeMessage`, with Telegram send, LLM extraction,
QStash, and TDM HTTP stubbed. Snapshots the outbound transcript + final `leads` / `survey_profiles`
state per journey.

## Run it

```bash
# disposable test DB with migrations applied
export POSTGRES_URL='postgres://…/regression_test'
npm run db:migrate

# BEFORE 014/015 — capture the baseline (commit the __snapshots__/ output)
npm run test:regression:update

# AFTER 014/015 — must pass with zero snapshot changes
npm run test:regression
```

CI (on `feature/ecuador-mexico`): `npm run test:regression` then
`git diff --exit-code tests/regression/__snapshots__`.

## Files

| File | Purpose |
|------|---------|
| `cam-harness.ts` | mocks factories, DB reset, journey runner, snapshot scrubber |
| `cam-journeys.ts` | journey definitions C1–C11 + quota seed |
| `cam-golden-master.test.ts` | one `it()` per journey → `toMatchSnapshot()` |
| `__snapshots__/` | committed baseline (generated) |

## Status

- C1 (Panamá full-qualify) + C4 (D1 decline) are worked references — `CAM_JOURNEYS_MVP`.
- C2–C11 are stubs to fill in during **014 T004a**; then switch the suite to `CAM_JOURNEYS_ALL`.
- Authoring a journey = run `test:regression:update` on pre-014 code, read the snapshot, add any
  turn the bot re-asked for, re-capture. The snapshot records what CAM does today — that is the spec.
