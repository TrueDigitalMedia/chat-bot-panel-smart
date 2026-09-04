# Contract: Survey Question-Skip Helper

**Module**: `src/lib/conversation/survey-plan.ts` — the module **feature 014 creates**; this helper is
**added by feature 016**. 014 does not build or depend on it.

## Why

Today the "hide Q5 (`neighborhood`) for CAM" logic is copy-pasted across four files
(`send-survey-question.ts`, `geo/handle-confirm.ts`, `phases/phase-1.ts`, `gps-capture.ts`), each noting
"a new advance path could miss its own copy". 016 needs the same skip behavior for `country` (pre-set
by a room). One helper replaces all copies and covers both cases.

**The resolved question list length and every question's position are UNCHANGED** — the helper only
decides which positions are *sent*, advancing `survey_question_index` past a skipped one exactly as
the current code does. This keeps existing in-flight `survey_question_index` values valid (no data
migration) and keeps 014's `resolveSurveyQuestions` a pure `[...prefix, ...scoring, ...suffix]`.

## Function

```ts
/**
 * Given a lead's country-resolved question list, the 1-based index the survey is about
 * to send, the lead's persisted survey_profiles field values, and the country's geo
 * labels, return the index of the next question that should actually be SENT — skipping
 * any question that is (a) already answered or (b) a geo question this country does not
 * ask. Advances transitively. Also returns which fields were skipped.
 */
export function nextQuestionToSend(
  questions: readonly SurveyQuestion[],          // resolveSurveyQuestions(country) — full list, stable indices
  fromIndex: number,                             // 1-based
  answered: Partial<Record<string, unknown>>,    // survey_profiles row (or the subset of field values)
  geoLabels: {                                   // getCountryConfig(country).geoHierarchy
    stateProvinceLabel: string | null
    municipalityLabel: string | null
    neighborhoodLabel: string | null
  },
): { index: number; skipped: string[] }
```

## Skip rules

A question at position `i` (field `f = questions[i-1].fieldName`) is skipped when **either**:

1. **Pre-answered** — `answered[f] != null`. (Today only `country`, set by a chat room. If a room lead
   later *corrects* their country it stays non-null, so it stays skipped and the corrected value is
   used.)
2. **Geo question this country does not ask** — `f` is `stateProvince` / `municipality` /
   `neighborhood` **and** the corresponding `geoLabels.*Label` is `null`. For CAM only `neighborhood`
   is null → skipped (identical to today's Q5-hidden behavior). Ecuador/México have all three labels →
   nothing skipped.

Skipping is transitive: keep advancing while the next question also matches. If everything remaining
is skipped, return `questions.length + 1` (survey complete).

Callers persist `survey_question_index = result.index` on both `leads` and `flow_states` and, for a
rule-2 skip, write the geo field `null` (same as the current code).

## Retires

The four inline `neighborhood` skips are deleted; each "advance to next question" site calls
`nextQuestionToSend` instead. No change to `resolveSurveyQuestions` itself.

## No-op guarantee (regression gate)

- CAM / Telegram / WhatsApp: rule 2 reproduces today's Q5-hidden sequence exactly (same positions,
  same persisted index progression); rule 1 never fires (`country` is answered at Q2, not before).
- The CAM golden-master suite (Telegram, `tests/regression/`) MUST show zero snapshot changes after
  this refactor.
- The bare-`/chat` "still asks country" behavior is checked by the Playwright E2E
  (`tests/e2e/chat-country-room.spec.ts`), not the golden-master.

## Tests (`tests/unit/survey-preanswered-skip.test.ts`)

- no pre-answered fields, Ecuador geo labels (all non-null) → returns `fromIndex` unchanged
- `country` pre-answered at index 2 → returns 3, `skipped: ['country']`
- CAM geo labels (`neighborhoodLabel === null`), reach position 5 → returns 6, `skipped: ['neighborhood']`
- both a pre-answered `country` and a null `neighborhoodLabel` → transitive skip
- everything remaining skipped → returns `length + 1`
