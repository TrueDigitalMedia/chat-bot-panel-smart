# Phase 0 Research: WhatsApp Country Numbers

All items resolved. No open `NEEDS CLARIFICATION` remain — the three feature-level clarifications
(shared WABA, Ecuador+Mexico only, number establishes country) were resolved in the spec.

## R1. How the inbound webhook learns which business number a message hit

**Decision**: Extract `entry[].changes[].value.metadata.phone_number_id` (and `display_phone_number`)
from the Meta webhook payload. Meta already includes this object on every `messages` change; the
code just never reads it. `extractMetaMessages` will return `{ message, phoneNumberId }` pairs (or
attach `phoneNumberId` to each returned message), and `handleMetaPost` will thread it into
`normalizeMetaInbound` → `ChannelInbound.whatsappPhoneNumberId` and into `processWhatsAppInbound`.

**Rationale**: Zero extra API calls; the identity is authoritative (comes from Meta, inside the
signed body). One shared webhook + one shared `WHATSAPP_APP_SECRET` still verifies every payload
(FR-009) — the signature covers the whole body regardless of which number it concerns.

**Alternatives considered**: (a) one webhook path per number — rejected: Meta sends all of a WABA's
numbers to the same subscribed callback URL; multiplexing by path would need separate app configs.
(b) Infer country from the recipient's own phone country code — rejected: unreliable (roaming,
ported numbers, diaspora) and not what "the number they messaged" means.

## R2. Number → country configuration shape

**Decision**: A single env var `WHATSAPP_NUMBER_MAP` (JSON): `{ "<phone_number_id>": "Ecuador",
"<phone_number_id>": "México" }`. A `phone_number_id` absent from the map = the shared/generic
number (ask the country question). Parsed once into a typed `Map` in a new
`src/lib/whatsapp/number-registry.ts`. The existing `WHATSAPP_PHONE_NUMBER_ID` stays as the
**default / fallback** number (the shared CAM number) used when a lead has no bound number (FR-007)
and as the outbound number for generic leads.

**Rationale**: Config-only add/remove/remap (FR-014, SC-008); no migration for the map; mirrors how
feature 016's `CHAT_ROOMS` is a small in-code registry but here the values are deployment-specific
(real `phone_number_id`s differ per environment) so env is the right home. Country values are
validated against `isSupportedCountry` / `getCountryConfig` at parse time — an unknown or
unconfigured country name logs and is treated as generic (Edge Cases).

**Alternatives considered**: (a) a DB table `whatsapp_numbers` — rejected as premature: 3 rows,
changes ~yearly, no runtime writes, and it would pull admin CRUD into scope. The admin view (US4)
reads the parsed registry. (b) hardcoded map like `chat-rooms.ts` — rejected: the ids are secrets/
environment-specific and would differ between dev and prod.

## R3. Binding a lead to its business number + outbound FROM-number threading

**Decision**:
- Add `leads.whatsapp_phone_number_id varchar(40)` — the number this lead's WhatsApp conversation is
  bound to. Set at lead creation from the inbound `phoneNumberId` (via `upsertLead`), null for
  non-WhatsApp leads and legacy rows.
- Add `whatsappPhoneNumberId?: string` to the `Lead` type and to `ChannelRecipient`.
- `messaging/send.ts` WhatsApp branches read `to.whatsappPhoneNumberId` and pass it as a new
  trailing arg to the `whatsapp.sendWhatsApp*` facade → `meta.sendMeta*` → `graphMessagesUrl(id)` /
  `graphSend(payload, id)`. When absent, `graphMessagesUrl` falls back to `env.WHATSAPP_PHONE_NUMBER_ID`
  exactly as today (FR-007) and logs `whatsapp_from_fallback`.
- Background jobs (`re-engage`, `deliver-registration-code`, freeze/timeout) already pass the full
  `lead` object as the recipient, so they inherit the bound number for free once it is on `Lead`.

**Rationale**: The lead row is the one place every send path — live webhook `after()` and detached
QStash jobs alike — already has in hand. Threading an explicit param (vs. AsyncLocalStorage) is
visible, testable, and works in the job context where there is no request-scoped store. `graphSend`
is the single choke point, so the change is: 1 column, 1 type field, 1 `ChannelRecipient` field,
~6 call sites in `messaging/send.ts`, and the 2 Meta provider modules.

**Alternatives considered**: (a) AsyncLocalStorage request context — rejected: background jobs run
outside any request; would need a parallel "job context" anyway. (b) Look up the number from the
lead's `acquisition_source` string — rejected: brittle string-parsing, and the generic number has
no source; the explicit column is clearer. (c) Derive from `survey_profiles.country` — rejected: a
lead can correct their country (Edge Cases) but replies must stay on the original number.

## R4. Skipping the country question for a country-scoped-number lead

**Decision**: Reuse feature 016's mechanism unchanged. At lead creation on a country-scoped number,
`processWhatsAppInbound` (before `routeMessage`) writes `survey_profiles.country` = the number's
country and `leads.acquisition_source` = `whatsapp:number:<country>`, then the existing
`nextQuestionToSend` / `nextQuestionForCountry` helper (added by 016 to `survey-plan.ts`) skips the
already-answered `country` question. `needsGpsCapture` already returns false once
`survey_profiles.country` is set, so — as with web rooms — these leads enter geo manually.

**Rationale**: Byte-for-byte the same "pre-answered field" path that 016 built and regression-proved
for web rooms; no new skip logic, no new `if (country === …)`. The only new code is *where* the
pre-set write happens (WhatsApp inbound instead of the web bootstrap GET).

**Alternatives considered**: A WhatsApp-specific country-skip branch — rejected, violates Principle
V and duplicates 016.

**Open sub-decision (planning, not a blocker)**: when a person who already has a lead (country
already answered on the shared number) later messages a country-scoped number, we do **not** re-scope
(FR-012) and we do **not** rebind the reply number — replies continue on whichever number the
lead's current `whatsapp_phone_number_id` holds (the first number they used). Rebinding on every
inbound was considered but rejected: it would split a single conversation across two numbers
mid-thread, which is exactly the Meta anti-pattern this feature avoids. Documented in data-model.md.

## R5. Acquisition-source value + admin visibility

**Decision**: `acquisition_source = 'whatsapp:number:Ecuador' | 'whatsapp:number:México'` (generic
WhatsApp leads keep `null`). Fits the existing `varchar(40)` column (max 22 chars). Extend
`SOURCE_FILTERS` / `roomLabel` in `src/app/admin/conversations/page.tsx` and the
`ListConversationsOptions.acquisitionSource` handling in `conversation-messages.ts` to recognise the
two new values (and a `'generic'` option already exists for web; add a WhatsApp equivalent or reuse).

**Rationale**: One consistent acquisition-source vocabulary across channels (web rooms + WhatsApp
numbers); the admin conversations filter already exists from 016 and just needs the new enum values.

## R6. Admin "WhatsApp numbers" page

**Decision**: New read-only `src/app/admin/whatsapp-numbers/page.tsx` (server component) that renders
`listWhatsAppNumbers()` from the number registry: display number (from `display_phone_number` if we
persist it, else the `phone_number_id`), scoped country or "genérico — pregunta país", and a
messaging-tier column. Sidebar link next to "Salas de chat".

**Messaging tier**: Meta exposes `messaging_limit_tier` and `quality_rating` on
`GET /{phone_number_id}?fields=...` and via the `phone_number_quality_update` webhook field. For the
MVP the page shows tier/quality **only if** a lightweight fetch succeeds at render (cached ~5 min);
otherwise it shows "no disponible" (FR-017). The `phone_number_quality_update` webhook subscription
is a follow-up, not in this feature.

**Rationale**: Satisfies US4 / SC-007 with a read-only surface; no CRUD (config is env). The tier
fetch is best-effort so a Meta API hiccup never breaks the page.

## R7. Regression strategy

**Decision**: This feature builds the **WhatsApp golden-master harness** that 014 T053a / 015 T046a
deferred — an in-process Vitest that drives `processWhatsAppInbound` / `routeMessage` with a mocked
`graphSend` (capturing `{ url, payload }`) and the real Neon dev DB, asserting: (a) a message with
no `phoneNumberId` (or the CAM `phone_number_id`) produces the exact same transcript, question
sequence, scoring, and template calls as `main`; (b) every captured send URL uses the expected
`phone_number_id`. Plus unit tests for the number registry, the inbound attribution, and the
outbound-from-number selection. The existing CAM Telegram golden-master must also stay green
(shared `survey-plan.ts` / `messaging/send.ts` touch).

**Rationale**: FR-018 / SC-005 require a positive "CAM number unchanged" proof, and the from-number
threading touches the shared send facade — exactly the kind of change the golden-master pattern
exists to guard.

## R8. Sequencing & dependencies

**Decision**: 017 lands after 014 + 015 + 016 (reuses the `CountryConfig` registry and 016's
`nextQuestionToSend` + acquisition-source convention). If a number maps to a country with no
`CountryConfig`, it degrades to generic (Edge Cases). Migration is `0031_whatsapp_country_numbers.sql`
(after 016's `0030`).

## R9. Meta account / policy assumptions

**Decision**: Out of scope for code — provisioning the EC/MX numbers, verifying them, registering
them on the shared WABA, and display-name approval happen in Meta Business Manager. This feature
consumes the resulting `phone_number_id`s via `WHATSAPP_NUMBER_MAP`. The per-number messaging-limit
ramp-up is an operational runbook item (shared with 014/015 launch-readiness), surfaced by the admin
page (R6). Business-messaging-policy / LOPDP / LFPDPPP review of running two more numbers is folded
into the existing 014/015 Phase 9 compliance gate, not re-opened here.
