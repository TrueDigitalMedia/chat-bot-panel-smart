# Implementation Plan: WhatsApp Country Numbers

**Branch**: `feature/ecuador-mexico` (spec dir `017-whatsapp-country-numbers`) | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-whatsapp-country-numbers/spec.md`

## Summary

Give Ecuador and Mexico their own dedicated WhatsApp business numbers (distinct from the shared CAM
number), all under one shared Meta WABA / app / token / secret / template inventory. Two mechanics:

1. **Inbound** — the shared Meta webhook reads `value.metadata.phone_number_id` (received today,
   never extracted), attributes each message to its business number, and — for a number mapped to a
   country in `WHATSAPP_NUMBER_MAP` — pre-sets `survey_profiles.country` + `leads.acquisition_source
   = 'whatsapp:number:<country>'` at lead creation, so feature 016's existing `nextQuestionToSend`
   skips the "¿En qué país…?" question. Messages to the shared CAM number are unchanged.
2. **Outbound** — the business number a lead is bound to is stored on `leads.whatsapp_phone_number_id`
   and threaded from `messaging/send.ts` through the Meta provider layer into `graphMessagesUrl()`,
   so every send (live reply, template, keyboard, video, and every background job — re-engage, code /
   link delivery, freeze/timeout) goes out from that number. No bound number → fall back to
   `env.WHATSAPP_PHONE_NUMBER_ID` and log.

Shared WABA ⇒ one signature secret verifies all payloads (no per-number secret) and one approved
template set serves all numbers (no `whatsapp_templates` schema change). Admin gets a read-only
"WhatsApp numbers" page. This feature also builds the WhatsApp golden-master regression harness that
014/015 deferred, to prove the CAM number is byte-identical before/after.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 20, Next.js 15 App Router

**Primary Dependencies**: Next.js route handlers + server components, Drizzle ORM, Neon Postgres,
Vitest, Playwright, Upstash QStash (re-engage job). Meta WhatsApp Cloud API (Graph). Reuses
`@/lib/whatsapp/*`, `@/lib/messaging/send`, `@/lib/conversation/*`, `@/lib/countries/*`, and feature
016's `nextQuestionToSend` / acquisition-source convention.

**Storage**: Neon Postgres via Drizzle. One migration `0031_whatsapp_country_numbers.sql`
(`leads.whatsapp_phone_number_id varchar(40)`, nullable). No other schema change — the number→country
map is env config, not a table.

**Testing**: Vitest unit (number registry parse/lookup; inbound `phone_number_id` attribution;
country pre-set on a scoped number; outbound from-number selection + fallback); **new WhatsApp
golden-master** (`tests/regression/whatsapp/`) — in-process `processWhatsAppInbound` with mocked
`graphSend` capturing `{url,payload}` + real dev DB; the existing CAM Telegram golden-master must
stay green; Playwright admin E2E for the numbers page.

**Target Platform**: Vercel (Next.js app + serverless route handlers + QStash callbacks).

**Project Type**: Web application — single `src/` tree.

**Performance Goals**: No added latency on the hot path — inbound adds one map lookup + (only for a
brand-new lead on a scoped number) one `survey_profiles` write; outbound adds one string selection.
The admin numbers page makes a best-effort, cached Meta fetch for the tier column only.

**Constraints**: Zero behavior change for the shared CAM number, Telegram, and web chat (FR-015,
SC-005). Never re-scope an existing conversation (FR-012). Never send a lead's message from a number
other than the one it is bound to (FR-006, SC-003); no automatic cross-number failover. Unknown
`phone_number_id` must never 5xx to Meta (FR-008, SC-009). One shared secret/token/template set —
no per-number credential or template storage (FR-009, FR-010).

**Scale/Scope**: 3 numbers (Ecuador, Mexico, shared CAM), config-extensible. 1 migration; 1 new
env var + registry module; ~2 modified inbound files; ~1 modified inbound pipeline file; the
`messaging/send.ts` facade + 2 Meta provider modules (`graph.ts`, `send.ts`) + the `whatsapp/send.ts`
facade; `Lead` / `ChannelRecipient` types; 1 new admin page + sidebar link; admin conversations
filter enum values; the new regression harness. ~15 modified/new source files.

**Dependencies**: features `014-ecuador-onboarding` + `015-mexico-onboarding` (the `CountryConfig`
registry, EC/MX questionnaires, `isSupportedCountry`) and `016-web-chat-country-rooms` (the
`nextQuestionToSend` pre-answered-skip helper in `survey-plan.ts`, `needsGpsCapture` returning false
when country is set, and the `acquisition_source` convention + admin conversations filter). All three
are merged on `feature/ecuador-mexico`. Operational dependency: the EC/MX numbers provisioned +
verified + registered on the shared WABA with approved display names (Meta Business Manager, not
code).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.2.0.

| Principle | Assessment |
|-----------|------------|
| I. AI Safety & Guardrails | PASS — no new LLM surface. The number only pre-fills the `country` field the user would otherwise pick; the opt-in / consent gate, sensitive-data consent, and all guardrails run unchanged. Inbound `phone_number_id` comes from inside the signed webhook body; the single shared `WHATSAPP_APP_SECRET` still verifies every payload. No new PII path (the business `phone_number_id` is not personal data; the sender's phone is handled exactly as today). |
| II. Observability First | PASS (with work) — plan adds structured logs: `whatsapp_inbound_number` (`phone_number_id`, `display_phone_number`, `resolved_country`, `outcome` ∈ `scoped` \| `generic` \| `unknown_number`), `whatsapp_number_scope_applied` (mirrors 016's `web_room_entry`), and `whatsapp_from_fallback` (bound number missing → CAM default). Every existing `[whatsapp:meta:out]` log gains the `phone_number_id` it sent from. `leads.acquisition_source` gives funnel attribution (FR-011, SC-006), surfaced in `/admin/conversations` and the new numbers page. |
| III. Simplicity / YAGNI | PASS — no parallel flow, no per-number credentials, no template schema change, no `whatsapp_numbers` table. The country-skip is 016's existing helper, unchanged. New abstractions: one env-backed registry (`number-registry.ts`) and one nullable column. Outbound threading is an explicit param through an already-single choke point (`graphSend`), not a new context system. |
| IV. Flexible Quota Eligibility | PASS — untouched. A number-scoped lead reaches the quota engine with a country + NSE level exactly as a self-selected lead would. |
| V. Country-Scoped Recruitment Configuration | PASS — the `phone_number_id → country` map is the single switch point (`number-registry.ts`), analogous to 016's `chat-rooms.ts`. No `if (country === …)` added anywhere; number-scoped leads run the standard `getCountryConfig(country)` flow. The new WhatsApp golden-master + the existing CAM Telegram golden-master prove nothing else moved. A number mapped to an unconfigured country degrades to generic. |

**Known pre-existing deviations (unchanged by this feature)**: the `isGuatemala` gates and
`makeCamConfig` geoHierarchy name-switch already documented in `docs/countries.md`. This feature adds
none.

No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/017-whatsapp-country-numbers/
├── plan.md              # This file
├── research.md          # Phase 0 (R1–R9)
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── number-registry.md
│   ├── inbound-number-attribution.md
│   └── outbound-from-number.md
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
src/lib/whatsapp/
├── number-registry.ts                     # NEW — parse WHATSAPP_NUMBER_MAP (JSON env) → Map<phone_number_id, country>;
│                                          #   countryForPhoneNumberId(id): string | null (null = generic);
│                                          #   listWhatsAppNumbers(): {phoneNumberId, displayNumber?, country|null}[];
│                                          #   defaultPhoneNumberId() = env.WHATSAPP_PHONE_NUMBER_ID
├── providers/meta/normalize-inbound.ts    # MODIFIED — MetaWebhookPayload gains value.metadata{phone_number_id,display_phone_number};
│                                          #   extractMetaMessages returns phoneNumberId per message;
│                                          #   normalizeMetaInbound sets ChannelInbound.whatsappPhoneNumberId
├── handle-inbound.ts                      # MODIFIED — carry whatsappPhoneNumberId onto the lead at upsert;
│                                          #   for a brand-new lead on a mapped number: set survey_profiles.country +
│                                          #   leads.acquisition_source='whatsapp:number:<country>' + log (before routeMessage);
│                                          #   existing lead → never re-scope, never rebind
├── send.ts                                # MODIFIED — every sendWhatsApp* gains a trailing fromPhoneNumberId?: string, forwarded to meta.*
└── providers/meta/
    ├── graph.ts                           # MODIFIED — graphMessagesUrl(phoneNumberId?) + graphSend(payload, phoneNumberId?);
    │                                      #   fall back to env.WHATSAPP_PHONE_NUMBER_ID + log whatsapp_from_fallback
    └── send.ts                            # MODIFIED — sendMetaText/Video/Keyboard accept + pass through fromPhoneNumberId; log it

src/app/api/webhooks/whatsapp/route.ts     # MODIFIED — handleMetaPost threads phoneNumberId from extractMetaMessages into
                                           #   upsertLead + processWhatsAppInbound; unknown id → treat as generic, log, still 200

src/lib/messaging/send.ts                  # MODIFIED — WhatsApp branches pass to.whatsappPhoneNumberId into whatsapp.sendWhatsApp*
src/types/channel.ts                       # MODIFIED — ChannelRecipient.whatsappPhoneNumberId?: string
src/types/lead.ts                          # MODIFIED — Lead.whatsappPhoneNumberId: string | null
src/lib/db/leads.ts                        # MODIFIED — upsertLead('whatsapp', …, { phoneNumberId }) persists it on create
src/lib/db/schema.ts                       # MODIFIED — leads.whatsappPhoneNumberId varchar(40)
src/lib/db/migrations/0031_whatsapp_country_numbers.sql   # NEW

src/app/admin/
├── admin-sidebar.tsx                      # MODIFIED — add "Números WhatsApp" link
├── whatsapp-numbers/page.tsx              # NEW — read-only list from listWhatsAppNumbers(); best-effort cached Meta tier fetch
└── conversations/page.tsx                 # MODIFIED — SOURCE_FILTERS + roomLabel recognise whatsapp:number:<country>
src/lib/db/conversation-messages.ts        # MODIFIED — acquisitionSource filter accepts the whatsapp:number:* values

tests/unit/whatsapp-number-registry.test.ts            # NEW
tests/unit/whatsapp-inbound-number-attribution.test.ts # NEW
tests/unit/whatsapp-outbound-from-number.test.ts       # NEW
tests/regression/whatsapp/                              # NEW — golden-master harness (fixtures + runner + snapshots)
tests/e2e/admin-whatsapp-numbers.spec.ts               # NEW
```

**Structure Decision**: Single `src/` web-app tree. The number→country map is a small env-backed
registry module (`number-registry.ts`), the single country switch point (Principle V), mirroring
016's `chat-rooms.ts`. The country-question skip reuses 016's `nextQuestionToSend` with no change —
only the *site* of the pre-set write is new (WhatsApp inbound). Outbound from-number is an explicit
parameter threaded through the already-single `graphSend` choke point; background jobs inherit it
because they pass the full `lead` (which now carries `whatsappPhoneNumberId`) as the recipient.

## Phase 0: Research

See [research.md](./research.md). Resolved: R1 inbound `phone_number_id` extraction from
`value.metadata`; R2 `WHATSAPP_NUMBER_MAP` env registry (not a table); R3 `leads.whatsapp_phone_number_id`
+ explicit param threading through `graphSend`; R4 reuse 016's `nextQuestionToSend` + no rebind on
later inbound; R5 `acquisition_source='whatsapp:number:<country>'` + admin conversations filter;
R6 read-only admin numbers page with best-effort Meta tier; R7 build the deferred WhatsApp
golden-master; R8 sequence after 014/015/016, migration `0031`; R9 Meta provisioning + policy/LOPDP
review are operational (Phase 9 gate), not code.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — `leads.whatsapp_phone_number_id`; the number-registry shape and
  parse/validation rules; `ChannelInbound` / `ChannelRecipient` / `Lead` additions; the
  acquisition-source value; lead↔number binding lifecycle (bind once at creation, never rebind, never
  re-scope); observability events.
- [contracts/number-registry.md](./contracts/number-registry.md) — `WHATSAPP_NUMBER_MAP` format,
  `countryForPhoneNumberId`, `listWhatsAppNumbers`, `defaultPhoneNumberId`; unknown-id and
  unconfigured-country degrade rules.
- [contracts/inbound-number-attribution.md](./contracts/inbound-number-attribution.md) — how
  `value.metadata.phone_number_id` flows from webhook → `ChannelInbound` → lead binding → country
  pre-set; new-lead vs existing-lead behavior; unknown-id handling (log, treat generic, still 200).
- [contracts/outbound-from-number.md](./contracts/outbound-from-number.md) —
  `graphMessagesUrl(phoneNumberId?)` / `graphSend(payload, phoneNumberId?)` semantics; how
  `messaging/send.ts` and every background job select the from-number; the fallback + log; the
  no-cross-number-failover rule.
- [quickstart.md](./quickstart.md) — post a webhook payload for each number; confirm country pre-set
  + skipped question for EC/MX and unchanged for CAM; confirm every outbound (incl. a re-engage job
  run) uses the bound number; unknown-id payload → 200 + generic; admin numbers page; run both
  golden-masters.

**Agent context update**: no `CLAUDE.md` / `update-agent-context` script present; nothing to update.

### Post-design Constitution re-check

Unchanged — all five principles PASS. The number→country map is a single registry (Principle V);
observability events and the bind-once / no-re-scope guarantees are designed in (Principle II); no
new credentials, tables, or LLM surface (Principle III / I).

### T036 self-review (post-implementation)

- **Principle V** — the only new country/number switch is `src/lib/whatsapp/number-registry.ts`
  (`countryForPhoneNumberId` / `inboundNumberOutcome`, backed by `WHATSAPP_NUMBER_MAP`).
  `handle-inbound.ts` and `number-scope.ts` call `countryForPhoneNumberId` / `isSupportedCountry` /
  `getCountryConfig`, never `if (id === …)` or `if (country === …)`. The country-question skip and
  manual-geo path are feature 016's existing helpers, unchanged — `number-scope.ts` only writes the
  pre-answered `country` field, exactly as 016's `room-bootstrap.ts` does.
- **Principle II** — `whatsapp_inbound_number` (outcome in every branch), `whatsapp_number_scope_applied`,
  `whatsapp_inbound_number_mismatch`, `whatsapp_from_fallback`, and a `phone_number_id` field on every
  `[whatsapp:meta:out]` log are emitted and unit-asserted (`whatsapp-country-scope.test.ts`,
  `whatsapp-outbound-from-number.test.ts`, `whatsapp-number-registry.test.ts`). `leads.acquisition_source`
  is filterable in `/admin/conversations` (T030/T031) and the numbers are visible on
  `/admin/whatsapp-numbers` (T028).
- **No-op for existing flows (FR-015 / SC-005)** — the CAM Telegram golden-master shows the only
  snapshot change is the new `whatsappPhoneNumberId: null` column (no transcript / index / scoring
  diff), re-pinned via `test:regression:update`; `graphMessagesUrl()` with no argument is
  byte-identical to before; `messaging/send.ts` Telegram/web branches are untouched; `tsc` clean;
  full unit suite green (689 tests).
- **Shared WABA (FR-009 / FR-010)** — no per-number secret/token/verify-token; one shared
  `WHATSAPP_APP_SECRET` verifies every payload (`whatsapp-inbound-number-attribution.test.ts`); no
  `whatsapp_templates` schema change.

### Remaining (not blocking merge of the functional change; tracked in tasks.md)

T011 + T015/T019/T027/T027a — the dedicated WhatsApp golden-master harness under
`tests/regression/whatsapp/` and its per-number URL fixtures. T020 / T032 — webhook-smoke and admin
Playwright E2E. T034 — runbook/health surface. T037 — quickstart drift check. The CAM Telegram
golden-master (re-pinned) already proves the shared-number path is unchanged; the outbound
from-number threading is covered by unit tests in the interim.

## Complexity Tracking

Not required — no constitution violations.
