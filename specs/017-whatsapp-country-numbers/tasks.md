---
description: "Task list for WhatsApp Country Numbers implementation"
---

# Tasks: WhatsApp Country Numbers

**Input**: Design documents from `/specs/017-whatsapp-country-numbers/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the spec defines per-story Independent Test criteria, "100% / 0" success
criteria (SC-001/002/003/004), and FR-018 / SC-005 require a positive "CAM number byte-identical"
regression proof. This feature also builds the WhatsApp golden-master harness deferred by 014 T053a /
015 T046a.

**Branch**: `feature/ecuador-mexico`

**Hard dependency**: features `014-ecuador-onboarding` + `015-mexico-onboarding` (the `CountryConfig`
registry, `isSupportedCountry`, the EC/MX questionnaires) and `016-web-chat-country-rooms` (the
`nextQuestionToSend` pre-answered-skip helper in `src/lib/conversation/survey-plan.ts`,
`needsGpsCapture` returning false when `survey_profiles.country` is set, and the
`leads.acquisition_source` convention + `/admin/conversations` source filter). All three are merged
on `feature/ecuador-mexico`. Phase 2 T004 gate-checks this. Meta Cloud API provider only — the
Twilio path is untouched.

**Operational dependency (not code)**: the Ecuador and Mexico numbers provisioned, verified, and
registered on the shared Meta WABA with approved display names; their `phone_number_id`s supplied for
`WHATSAPP_NUMBER_MAP`.

## Path Conventions

Single `src/` web-app tree. New: `src/lib/whatsapp/number-registry.ts`,
`src/app/admin/whatsapp-numbers/`, `tests/regression/whatsapp/`. One migration
`0031_whatsapp_country_numbers.sql` (after 016's `0030`, journal idx 15). Tests under `tests/unit/`,
`tests/e2e/`, `tests/regression/whatsapp/`.

---

## Phase 1: Setup

- [ ] T001 Add `WHATSAPP_NUMBER_MAP: z.string().optional()` to the schema in `src/lib/env.ts` (raw JSON string, parsed by the registry, not by zod) and document it in `.env.example` with an inline comment: `{"<phone_number_id>":"Ecuador","<phone_number_id>":"México"}` — absent id = generic/shared number
- [ ] T002 Implement `src/lib/whatsapp/number-registry.ts` per `contracts/number-registry.md` — parse `env.WHATSAPP_NUMBER_MAP` once at module load into `Map<string, string>` (validate each value with `isSupportedCountry` from `src/lib/countries/registry.ts`; drop + `console.warn('whatsapp_number_map_bad_country', …)` on unsupported; `console.error('whatsapp_number_map_invalid_json')` + empty registry on bad JSON, never throw). Export `countryForPhoneNumberId(id): string | null`, `listWhatsAppNumbers(): { phoneNumberId, country, isDefault }[]`, `defaultPhoneNumberId(): string | undefined` (= `env.WHATSAPP_PHONE_NUMBER_ID`)
- [ ] T003 [P] Unit test `tests/unit/whatsapp-number-registry.test.ts` — the full table in `contracts/number-registry.md`: mapped id → country, unmapped id → null, default CAM id → null, `null`/`undefined`/`''` → null, unsupported-country value dropped + warn, invalid JSON → empty + no throw, duplicate country across two ids, `listWhatsAppNumbers()` shape + default-first ordering

**Checkpoint**: Number registry exists, is covered, and never throws on bad config.

---

## Phase 2: Foundational (BLOCKING — no user story can start until this is done)

**Purpose**: the `leads.whatsapp_phone_number_id` column + migration, the type additions that carry
the number through inbound/outbound, extraction of `phone_number_id` from the Meta payload, and the
WhatsApp golden-master harness scaffold.

- [ ] T004 Verify the 014 + 015 + 016 groundwork is present: `src/lib/countries/registry.ts` with `getCountryConfig` / `isSupportedCountry` and `Ecuador` + `México` configs; `src/lib/conversation/survey-plan.ts` exports `nextQuestionToSend` / `nextQuestionForCountry`; `src/lib/conversation/gps-capture.ts` `needsGpsCapture` returns false when `survey_profiles.country` is set; `src/lib/db/schema.ts` has `leads.acquisitionSource`; `/admin/conversations` has `SOURCE_FILTERS`. If any absent, STOP and land 014/015/016 first
- [ ] T005 Add `whatsappPhoneNumberId: varchar('whatsapp_phone_number_id', { length: 40 })` (nullable) to the `leads` table in `src/lib/db/schema.ts` per `data-model.md` §1
- [ ] T006 Create migration `src/lib/db/migrations/0031_whatsapp_country_numbers.sql` — `ALTER TABLE "leads" ADD COLUMN "whatsapp_phone_number_id" varchar(40);` with `--> statement-breakpoint`, add its entry to `src/lib/db/migrations/meta/_journal.json` (idx 15), and apply it to the live Neon dev branch in this same change (per memory: migrations must be applied, not just committed). No backfill
- [ ] T007 Add `whatsappPhoneNumberId: string | null` to the `Lead` type in `src/types/lead.ts` and `whatsappPhoneNumberId?: string` to `ChannelRecipient` and `ChannelInbound` in `src/types/channel.ts` per `data-model.md` §3–4
- [ ] T008 In `src/lib/whatsapp/providers/meta/normalize-inbound.ts`: extend `MetaWebhookPayload` with `value.metadata?: { phone_number_id?: string; display_phone_number?: string }`; change `extractMetaMessages` to return `Array<{ message: MetaInboundMessage; phoneNumberId?: string; displayPhoneNumber?: string }>` (read `change.value.metadata`); set `ChannelInbound.whatsappPhoneNumberId` in `normalizeMetaInbound` (add a param) per `contracts/inbound-number-attribution.md`
- [ ] T009 Update `src/lib/whatsapp/providers/meta/normalize-inbound.test.ts` (+ any callers in `src/lib/whatsapp/normalize-inbound.ts` barrel) for the new `extractMetaMessages` return shape; assert `phoneNumberId` is threaded through and is `undefined` when `metadata` is absent
- [ ] T010 Extend `upsertLead` in `src/lib/db/leads.ts` to accept an optional `{ phoneNumberId?: string }` and, **only when creating** a `whatsapp` lead, persist `whatsapp_phone_number_id = phoneNumberId`; never overwrite on an existing lead. Unit-cover in `tests/unit/` (new or existing leads test)
- [ ] T011 Scaffold the WhatsApp golden-master harness under `tests/regression/whatsapp/` — a runner that drives `processWhatsAppInbound` / `routeMessage` against the real Neon dev DB with `graphSend` mocked to record `{ url, payload }` (no network), plus `npm run test:regression:whatsapp` + `:update` scripts in `package.json`, mirroring `tests/regression/` (Telegram). One smoke fixture (CAM number, 2–3 turns) with a committed snapshot

**Checkpoint**: The number rides on the lead, the inbound payload's `phone_number_id` is extracted,
and the regression harness runs green on a CAM fixture.

---

## Phase 3: User Story 3 — Inbound messages attributed to the right number (Priority: P1)

**Goal**: every inbound Meta message is attributed to its business number, that number is bound to
the lead at creation, and an unknown number never errors.

**Independent Test**: POST webhook payloads for each of the three numbers to the single endpoint;
each resulting lead records the number it arrived on; a payload for an unmapped number returns 200
and is logged.

- [ ] T012 [US3] In `src/app/api/webhooks/whatsapp/route.ts` `handleMetaPost`: iterate the new `extractMetaMessages` return shape; pass `phoneNumberId` into `upsertLead('whatsapp', E164(from), { phoneNumberId })` and into `processWhatsAppInbound(inbound, { messageId, provider: 'meta', phoneNumberId })`; emit `whatsapp_inbound_number` log (`phone_number_id`, `display_phone_number`, `resolved_country` via `countryForPhoneNumberId`, `outcome` ∈ `scoped`|`generic`|`unknown_number`) per the outcome-classification table in `contracts/inbound-number-attribution.md` (`unknown_number` = a `phone_number_id` present in the payload but neither mapped nor equal to the default CAM id; it behaves like `generic` for the conversation but is logged distinctly). Every outcome, incl. `unknown_number`, still returns `200 { status: 'received' }` (FR-008)
- [ ] T013 [US3] In `src/lib/whatsapp/handle-inbound.ts` `processWhatsAppInbound`: thread `logMeta.phoneNumberId` through; on an **existing** lead whose stored `whatsapp_phone_number_id` differs from the inbound id, log `whatsapp_inbound_number_mismatch` and do nothing else (no rebind, no re-scope) per `contracts/inbound-number-attribution.md`
- [ ] T014 [P] [US3] Unit test `tests/unit/whatsapp-inbound-number-attribution.test.ts` — new lead on a mapped id gets `whatsapp_phone_number_id` set; new lead on the CAM/absent id gets it null-or-CAM; existing lead is never re-bound; an id in the payload that is neither mapped nor the default CAM id → `outcome: 'unknown_number'` + no throw + still `200`; a payload with no `metadata` → `outcome: 'generic'`; `whatsapp_inbound_number` logged in every branch (keep the sender phone out of the log). **Also cover FR-009 (C1)**: a payload signed with the single shared `WHATSAPP_APP_SECRET` whose `metadata.phone_number_id` is the Ecuador id passes `verifyMetaSignature` (one shared secret verifies every number; no per-number secret is read). **Also cover the two-number edge case (E1)**: two inbound payloads from the same `E164(from)` on two different `phone_number_id`s produce ONE lead, `whatsapp_phone_number_id` stays the first id, and `whatsapp_inbound_number_mismatch` is logged on the second
- [ ] T015 [P] [US3] Regression fixture `tests/regression/whatsapp/` — add an Ecuador-`phone_number_id` fixture; assert every recorded `graphSend` URL for it targets the Ecuador id and the transcript still matches (this fixture will fully pass once US1 + US2 land; commit it now asserting attribution + URL only)

**Checkpoint**: Inbound attribution + lead binding complete and covered; no user story below can be
done without it.

---

## Phase 4: User Story 1 — Person messages the country number and is never asked their country (Priority: P1)

**Goal**: a brand-new lead on the Ecuador or Mexico number is pre-scoped to that country and the
"¿En qué país te encuentras?" question is never sent; the shared CAM number is unchanged.

**Independent Test**: inbound attributed to the Ecuador number → lead country = Ecuador, country
question never sent, Ecuador questionnaire/scoring/geo; repeat Mexico; CAM number still asks.

- [ ] T016 [US1] In `src/lib/whatsapp/handle-inbound.ts` (before `routeMessage`): when the lead was **just created** AND `countryForPhoneNumberId(phoneNumberId)` is non-null — upsert `survey_profiles.country = <country>`, set `leads.acquisition_source = 'whatsapp:number:' + country`, log `whatsapp_number_scope_applied` per `contracts/inbound-number-attribution.md`. Reuse the exact profile-upsert path feature 016 uses in the web-room bootstrap. Existing lead → skip entirely (FR-012)
- [ ] T017 [US1] Confirm no country-skip code is added here — `nextQuestionToSend` / `needsGpsCapture` (016) already handle the pre-answered `country` and the manual-geo path. Add a code comment in `handle-inbound.ts` pointing to feature 016 as the skip authority (Principle V: the `number-registry` map is the only new switch point)
- [ ] T018 [P] [US1] Unit test `tests/unit/whatsapp-country-scope.test.ts` — new lead on the Ecuador id → `survey_profiles.country = 'Ecuador'` + `acquisition_source = 'whatsapp:number:Ecuador'` + `whatsapp_number_scope_applied` logged; new lead on the Mexico id → México; new lead on the CAM/absent id → country + acquisition_source stay null; existing lead with an answered country → not overwritten
- [ ] T019 [P] [US1] Regression fixtures `tests/regression/whatsapp/` — (a) CAM fixture: assert the country question IS sent and the transcript is byte-identical to the pre-feature snapshot (SC-005); (b) Ecuador fixture: assert the country question is NEVER sent, the first geo prompt uses Ecuador wording, and scoring is Ecuador's (SC-001/002). Run `npm run test:regression` (Telegram) to confirm no cross-channel drift
- [ ] T020 [P] [US1] E2E-style test `tests/e2e/whatsapp-country-number.spec.ts` (webhook-status smoke, per repo convention) — POST a signed Meta payload with the Ecuador `phone_number_id`; assert `200`; assert the DB lead row has the expected country + acquisition_source

**Checkpoint**: US1 delivered — country numbers scope leads and skip the question; CAM byte-identical.

---

## Phase 5: User Story 2 — Every reply and follow-up goes out from the number the person contacted (Priority: P1)

**Goal**: outbound FROM-number = the lead's bound number, for live replies AND every background job;
missing binding falls back to the CAM default and logs; no cross-number failover.

**Independent Test**: for a lead on each number, trigger a live reply, the registration-link send,
the verification-code template, and a re-engage job run; every outbound is attributed to that lead's
number.

- [ ] T021 [US2] In `src/lib/whatsapp/providers/meta/graph.ts`: `graphMessagesUrl(phoneNumberId?: string)` → uses `phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID`; `graphSend(payload, phoneNumberId?)` forwards it. `Authorization` header unchanged (shared token). Per `contracts/outbound-from-number.md`
- [ ] T022 [US2] In `src/lib/whatsapp/providers/meta/send.ts`: `sendMetaText` / `sendMetaVideo` / `sendMetaKeyboard` accept a trailing `fromPhoneNumberId?: string`, forward to `graphSend`, and include `phone_number_id` in the `[whatsapp:meta:out]` logs
- [ ] T023 [US2] In `src/lib/whatsapp/send.ts`: `sendWhatsAppText` / `sendWhatsAppVideo` / `sendWhatsAppKeyboard` / `sendWhatsAppTemplateOrKeyboard` / `sendWhatsAppTemplateOrText` accept a trailing `fromPhoneNumberId?: string`, forward to the `meta.*` functions; Twilio branch ignores it
- [ ] T024 [US2] In `src/lib/messaging/send.ts`: every `case 'whatsapp':` branch (sendText, sendVideo, sendInlineKeyboard, sendTemplateOrKeyboard, sendTemplateOrText, sendPhoneRequest, confirmPhoneSaved, and any other) passes `to.whatsappPhoneNumberId` as `fromPhoneNumberId`. When `to.whatsappPhoneNumberId` is absent, log `whatsapp_from_fallback { lead_id: leadIdOf(to), fell_back_to: defaultPhoneNumberId() }` once per send. Telegram/web branches untouched
- [ ] T025 [US2] Verify background-job recipients carry the bound number: `src/app/api/jobs/re-engage/route.ts`, `src/lib/onboarding/deliver-registration-code.ts` (incl. the `otpRecipient = { ...lead, channelUserId: lead.phoneNumber }` spread — confirm it keeps `whatsappPhoneNumberId`), `src/lib/onboarding/request-registration-code.ts`, and any freeze/timeout sender. Where a job loads a lead via a narrowed `select`, add `whatsappPhoneNumberId` to the column list
- [ ] T026 [P] [US2] Unit test `tests/unit/whatsapp-outbound-from-number.test.ts` — `graphMessagesUrl(id)` uses `id`; `graphMessagesUrl()` uses the CAM default; `messaging/send` whatsapp branch with `to.whatsappPhoneNumberId` set → `sendMeta*` called with it; with it absent → CAM default + `whatsapp_from_fallback` logged; Telegram branch unaffected
- [ ] T027 [P] [US2] Regression `tests/regression/whatsapp/` — extend the Ecuador and CAM fixtures to drive through `link_sent` + a simulated `deliver-registration-code` and a re-engage nudge; assert EVERY recorded `graphSend` URL for the Ecuador lead contains the Ecuador id and every one for the CAM lead contains the CAM id (SC-003); refresh snapshots via `:update` only after confirming transcripts unchanged
- [ ] T027a [P] [US2] **FR-016 (C2)** — confirm per-number routing does not alter re-engagement behavior: re-run the existing re-engage test suite (`npm test -- re-engage scheduler`) unchanged, and add one assertion to the T027 re-engage fixture that the nudge is still gated by the single-attempt cap (`MAX_REENGAGEMENT_ATTEMPTS`) and the same `reengagementDelaySeconds` as `main` — the only difference is the `graphSend` URL's `phone_number_id`. No change to `src/lib/scheduler/*` or the 24h-window logic

**Checkpoint**: US2 delivered — no cross-number sends; legacy leads fall back cleanly.

---

## Phase 6: User Story 4 — Operator configures and monitors the numbers (Priority: P2)

**Goal**: admin can see the configured numbers, their country mapping, and (best-effort) messaging
tier; adding a number is config-only.

**Independent Test**: admin view lists the numbers with country mapping and display number; adding a
map entry (no code change) makes it routable/selectable.

- [ ] T028 [US4] New `src/app/admin/whatsapp-numbers/page.tsx` (server component, `export const dynamic = 'force-dynamic'`) — render `listWhatsAppNumbers()` as a table: **display-number column** = `display_phone_number` from the best-effort Meta lookup when it succeeds, otherwise the `phone_number_id` itself (FR-013 "when available"); scoped country or "genérico — pregunta país"; `isDefault` badge; messaging-tier column. One best-effort `GET https://graph.facebook.com/{version}/{phone_number_id}?fields=display_phone_number,messaging_limit_tier,quality_rating` per number, wrapped in try/catch with an in-memory (per-instance) ~5 min cache; on failure the tier column shows "no disponible" (FR-017) and the display column falls back to the id. Reuse the admin table styling from `src/app/admin/rooms/`
- [ ] T029 [US4] Add a "Números WhatsApp" link to `src/app/admin/admin-sidebar.tsx` (next to "Salas de chat"), with a lucide icon
- [ ] T030 [US4] In `src/app/admin/conversations/page.tsx`: add `{ value: 'whatsapp:number:Ecuador', label: 'WhatsApp: Ecuador' }` and `{ value: 'whatsapp:number:México', label: 'WhatsApp: México' }` to `SOURCE_FILTERS`; extend `roomLabel()` to return `'WA EC'` / `'WA MX'` for those; optionally add a `whatsapp-generic` option (`channel='whatsapp' AND acquisition_source IS NULL`)
- [ ] T031 [US4] In `src/lib/db/conversation-messages.ts`: extend the `acquisitionSource` filter in `ListConversationsOptions` / `listConversations` to accept the two `whatsapp:number:*` values (exact match) and, if added, the `whatsapp-generic` compound condition — mirroring the existing web `'generic'` handling
- [ ] T032 [P] [US4] E2E `tests/e2e/admin-whatsapp-numbers.spec.ts` (admin-login convention, `test.skip` when `ADMIN_PASSWORD` unset) — the page lists a row per configured number with its country label; the sidebar link opens it; `/admin/conversations` source dropdown offers the two WhatsApp options and filtering sets the URL param

**Checkpoint**: US4 delivered — operator visibility; config-only extension confirmed by T003 + T032.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T033 [P] Update `docs/countries.md` (or a new `docs/whatsapp-numbers.md`) — the `WHATSAPP_NUMBER_MAP` env format, the shared-WABA model (one token/secret/template set), how to add a number (provision in Meta → add to the map → redeploy), the ramp-up note (per-number messaging limits), and that the `number-registry` map is the single Principle V switch point
- [ ] T034 [P] Add `WHATSAPP_NUMBER_MAP` to any deploy/runbook doc and to the health/readiness surface if it enumerates WhatsApp config (`whatsappWebhookReady` / `isMetaWhatsAppConfigured` neighbours) — surface "N numbers mapped" without leaking the ids
- [ ] T035 Run the full gate: `npm run test:regression` (Telegram CAM — green), `npm run test:regression:whatsapp` (CAM byte-identical + per-number URLs), `npm test -- whatsapp-number-registry whatsapp-inbound-number-attribution whatsapp-country-scope whatsapp-outbound-from-number`, `npx playwright test whatsapp-country-number admin-whatsapp-numbers`, `npm run lint`, `npx tsc --noEmit`. Revert build-artifact churn (`yarn.lock`, `tsconfig.tsbuildinfo`, `next-env.d.ts`) before committing
- [ ] T036 Constitution self-review (Principle V + II): confirm the only new country/number switch is `src/lib/whatsapp/number-registry.ts`; `handle-inbound.ts` and `messaging/send.ts` call `countryForPhoneNumberId` / read `whatsappPhoneNumberId`, never `if (id === …)` / `if (country === …)`; confirm `whatsapp_inbound_number`, `whatsapp_number_scope_applied`, and `whatsapp_from_fallback` are emitted and unit-asserted; append the findings to `plan.md` under "Post-design Constitution re-check"
- [ ] T037 [P] Update `specs/017-whatsapp-country-numbers/quickstart.md` if any path/name drifted during implementation, and mark the `checklists/requirements.md` items still true

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US3)** → **Phase 4 (US1)** →
  **Phase 5 (US2)** → **Phase 6 (US4)** → **Phase 7 (Polish)**.
- US1 and US2 both depend on **US3** (inbound attribution + lead binding). They do not depend on each
  other for *code*, but the Ecuador regression fixture only fully passes once both land (noted in
  T015 / T019 / T027).
- US4 depends only on Phase 1 (the registry) + the `acquisition_source` values written in US1 — it
  can be built in parallel with US2 once US1 is done.
- Phase 2 is a hard block: the column, types, payload extraction, and harness gate everything.

## Parallel Opportunities

- Phase 1: T003 [P] alongside T002's review.
- Phase 2: T007 [P] (types) can proceed alongside T005/T006 (schema/migration); T011 (harness
  scaffold) is independent of T008–T010.
- US3: T014, T015 [P] (different files) after T012–T013.
- US1: T018, T019, T020 [P] after T016–T017.
- US2: T026, T027, T027a [P] after T021–T025.
- US4: all of T028–T031 touch different files and can mostly run in parallel; T032 [P] after them.
- Polish: T033, T034, T037 [P]; T035/T036 last.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US3) + Phase 4 (US1).** That delivers the headline value —
a person on the Ecuador/Mexico number is scoped and never asked their country — and proves the CAM
number is byte-identical. **US2 (outbound from-number) is required before production launch** of the
new numbers (Meta's same-number reply rule), so ship US1+US2 together even though US1 is
independently testable. US4 (admin visibility) and Polish follow.

## Notes

- Meta provider only; Twilio path untouched (T023 confirms).
- No `whatsapp_templates` schema change and no per-number secret/token — shared WABA (FR-009/010).
- The number→country map is env config; adding a number is config-only (FR-014, SC-008).
- Per-number Meta messaging-limit ramp-up and the business-messaging-policy / LOPDP / LFPDPPP review
  of the two new numbers are operational (the 014/015 Phase 9 launch-readiness gate), not tasks here.
