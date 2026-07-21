# Contract: `checkQuotaAvailability` (internal, `src/lib/scoring/quota.ts`)

Not an HTTP route — called synchronously from `phase-1.ts` and `handle-confirm.ts` right after the survey completes and the NSE score is computed. This contract replaces the one implicitly defined by spec 005.

## Signature

```ts
interface CheckQuotaAvailabilityParams {
  country: string
  nseRegion: string
  segment: string                 // getQuotaSegment() output, e.g. 'Nivel 4'
  age: number | null
  householdSize: number | null
  isPregnant: boolean | null
  hasBabyUnder3: boolean | null
  leadId?: string
}

interface QuotaDecision {
  qualifies: boolean
  matchedDimension: 'nse' | 'edad' | 'integrantes' | 'exception' | null
  matchedValue: string | null
}

function checkQuotaAvailability(params: CheckQuotaAvailabilityParams): Promise<QuotaDecision>
```

## Behavior

1. **Exception path**: `isPregnant === true || hasBabyUnder3 === true` → always `{ qualifies: true, matchedDimension: 'exception', matchedValue: null }`. No dimension or region-cap check is performed for this lead.
2. **Region cap gate**: if `quota_region_caps` has an active row for `(country, nseRegion)` with `cap_count` not null, and the count of leads in `QUALIFIED_STATUSES` for that `(country, nseRegion)` (any `quota_matched_dimension`, including `'exception'`) is `>= cap_count` → `{ qualifies: false, matchedDimension: null, matchedValue: null }`.
3. **Dimension OR-match**, evaluated in fixed order `nse → edad → integrantes`:
   - `nse`: look up `quota_targets` row `(country, nseRegion, 'nse', segment)`.
   - `edad`: bucket `age` via `ageBand()` (research.md R3), look up `(country, nseRegion, 'edad', band)`.
   - `integrantes`: bucket `householdSize` via `householdBand()`, look up `(country, nseRegion, 'integrantes', band)`.
   - For each, a row must exist, be `active`, and have `available > 0` (`available = target_count - achieved`, `achieved` = count of `QUALIFIED_STATUSES` leads with matching `quota_matched_dimension`/`quota_matched_value`/region/country — see data-model.md).
   - The first dimension in that order with `available > 0` wins: `{ qualifies: true, matchedDimension, matchedValue }`.
4. **No match**: if none of the three dimensions has room → `{ qualifies: false, matchedDimension: null, matchedValue: null }`.

`age === null` or `householdSize === null` simply makes that dimension unmatchable (treated as no row found for that bucket) — it does not error.

## Caller responsibility

On `qualifies: true`, the caller (`phase-1.ts` / `handle-confirm.ts`) persists `leads.quota_matched_dimension` and `leads.quota_matched_value` in the same `db.update(leads)` call that already writes `score`/`quota_segment`, then proceeds to `transitionLead(..., 'link_sent', ...)` as today. On `qualifies: false`, behavior is unchanged: `transitionLead(..., 'quota_exhausted', ...)`.

## Logging

The existing `quota_check` structured log event (`src/lib/scoring/quota.ts`) gains `matched_dimension`, `matched_value`, and `region_cap_blocked: boolean` fields — needed to debug why a specific lead was or wasn't accepted under the new OR-matching rule.
