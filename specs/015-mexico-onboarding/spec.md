# Feature Specification: Mexico Onboarding

**Feature Branch**: `feature/ecuador-mexico`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Mexico onboarding from docs/mexico/"

## Overview

The recruitment bot currently onboards panelists in the seven Central America / Dominican Republic
markets using the Kantar SCL-CAM socioeconomic formula, and Ecuador is being added as a separate
feature. The business is also expanding recruitment to **Mexico**, which uses its own questionnaire, a
different socioeconomic (NSE) scoring instrument (the AMAI-style six-variable rule), and different
administrative geography (Estado → Municipio, with Código Postal and Colonia). This feature adds Mexico
as a fully configured country so a Mexican household can complete the same conversational flow
(screening → household profile → address & geography → NSE scoring → quota decision → panel
registration) with content and rules correct for Mexico, without changing behavior for existing
countries.

Source of truth for all Mexico-specific content and rules:

- `docs/mexico/Cuestionario Mexico.docx` — the approved Mexico questionnaire (question wording, answer
  options, field order, address structure, phone fields, "Origen" options).
- `docs/mexico/Muestra Regiones NSE Mexico.xlsx` — the Mexico region catalog
  (REGION / Region Kantar / ESTRATO → Estado → Municipio), the NSE point tables for the six scoring
  variables, and the point-total → NSE-level cutoffs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mexican household completes screening and household profile (Priority: P1)

A Mexican person contacts the bot (via any supported channel) and is guided through the initial
screening questions and the Phase-1 household-profile questions using México's questionnaire wording
and answer options. The household is identified as being in México and the flow uses México content
from that point on.

**Why this priority**: Nothing else in the México flow can run until the household is recognized as
being in México and the country-specific questionnaire drives the conversation. This is the minimum
slice that proves the bot can talk to a Mexican panelist at all.

**Independent Test**: Run a conversation flagged as México through screening and the Phase-1
household-profile questions; confirm every prompt, answer button, and validation matches
`Cuestionario Mexico.docx` (e.g. the "Origen" options, the sensitive-industry screener, the
respondent-profile capture — plus the per-member phone/email step if the T003a spike keeps it in
scope), and that a CAM conversation in parallel is unchanged.

**Acceptance Scenarios**:

1. **Given** a new contact identified as being in México, **When** they start the flow, **Then** the
   screening questions, the "Origen" options, and the household questions shown are the México set,
   not the CAM set.
2. **Given** a México conversation, **When** the household reports someone working in a sensitive
   industry (advertising agency; market research company; radio/press/TV; owner of an industry or
   business in food, beverages, personal hygiene, home cleaning, clothing, or footwear), **Then** the
   lead is screened out with the standard "not qualified" outcome.
3. **Given** a México conversation, **When** the Phase-1 household-profile questions are asked, **Then**
   the same fields the CAM Phase-1 survey collects (respondent name, gender, age, household size,
   pregnancy status, baby aged 0–36 months) are captured with México wording. Per-member data (names
   of the other household adults + their phone/email) is captured only if the T003a scoping spike
   keeps it in this feature; the rest of the Phase-4 ficha del hogar is unchanged and out of scope
   (see Assumptions).

---

### User Story 2 - Mexico address and geography resolve to an NSE region (Priority: P1)

The Mexican household provides its address using Mexico's structure (Calle and número exterior/interior,
complemento, Colonia, Estado, Municipio, Código Postal) or shares its location, and the bot resolves it
to one of the Mexico NSE regions (Kantar region) from the region catalog. Addresses outside the catalog
are treated as out of geographic quota.

**Why this priority**: NSE region is a required input to the quota decision. Mexico's geography does
not fit the CAM department/municipality model, so without this the flow cannot reach a decision.

**Independent Test**: Provide a set of known Mexico addresses (including a Mexico City / Estado de
México municipio in the AMCM region, a Centro-region municipio, a Sureste municipio, and an address
not in the catalog) and confirm each resolves to the expected Kantar region or is flagged out of
geographic quota.

**Acceptance Scenarios**:

1. **Given** a Mexico conversation, **When** the household is asked where it lives, **Then** it is
   asked for Estado, Municipio, and Código Postal (not "Departamento/Municipio" CAM-style), plus
   Colonia and street address.
2. **Given** an address in Municipio "Iztapalapa" (Distrito Federal), **When** geography is resolved,
   **Then** the NSE region is the AMCM Kantar region.
3. **Given** an address in Municipio "Tula de Allende" (Hidalgo), **When** geography is resolved,
   **Then** the NSE region is the Centro Kantar region.
4. **Given** an address whose Estado/Municipio is not present in the Mexico catalog, **When** geography
   is resolved, **Then** the lead is marked out of geographic quota and does not proceed to a quota
   decision.
5. **Given** a Mexico phone-number entry, **When** the household provides a landline or mobile number,
   **Then** it is validated as a 10-digit Mexican number, and an optional additional contact number is
   accepted.

---

### User Story 3 - Mexico NSE score and level are computed from the AMAI-style instrument (Priority: P1)

Based on the six Mexico socioeconomic questions (household head's highest completed schooling; number
of full bathrooms with shower and toilet; number of cars or vans; whether the home has non-mobile
internet; how many household members aged 14+ worked in the last month; and number of rooms used for
sleeping), the bot computes a point total and maps it to a Mexico NSE level. This level, not an
SCL-CAM segment, is used for the Mexico quota decision.

**Why this priority**: The NSE level is the other required input to the quota decision and is the core
reason Mexico cannot reuse the existing scoring code.

**Independent Test**: Feed the worked example from `Muestra Regiones NSE Mexico.xlsx` (and additional
constructed cases at each cutoff boundary) into the scoring and confirm the point total and NSE level
match the spreadsheet.

**Acceptance Scenarios**:

1. **Given** a Mexico conversation, **When** the socioeconomic questions are asked, **Then** the
   questions, answer options, and their point values are the Mexico set from the reference workbook.
2. **Given** the reference example (household head completed primary school; 1 full bathroom; 0 cars;
   no home internet; 3 members aged 14+ worked last month; 3 rooms used for sleeping), **When** the
   score is computed, **Then** the point total is 105 and the NSE level is "D+".
3. **Given** a household whose point total is at each level boundary, **When** the level is derived,
   **Then** the mapping is: below 100 → "D/E", 100–140 → "D+", 141–167 → "C", 168–201 → "C+", 202 and
   above → "AB". (The workbook labels the lowest band "6–99"; totals of 0–5 from missing answers also
   map to "D/E".)
4. **Given** a México lead has completed scoring, **When** its lead record is inspected, **Then**
   `quota_segment` holds a México NSE level ("AB" / "C+" / "C" / "D+" / "D/E") and the SCL-CAM `score`
   field is null. (The isolation rule — México leads evaluated only against México quota config — is
   FR-011, exercised in User Story 4.)

---

### User Story 4 - México lead reaches a quota decision and, if accepted, panel registration (Priority: P2)

A México lead with a resolved NSE region and NSE level is evaluated against México quota configuration
(per-dimension quotas, per-region aggregate caps, and the pregnancy / baby-under-36-months unlimited
exception), and an accepted lead is routed into the existing panel registration and TDM sync path,
tagged with country "México".

**Why this priority**: Completes the funnel, but depends on Stories 1–3. The quota engine and
registration path already exist; this story is about feeding them Mexico-correct inputs and
configuration.

**Independent Test**: With Mexico quota targets and region caps loaded, run accepted, quota-exhausted,
and pregnancy/baby-exception leads end to end and confirm the decision, the resulting lead status, and
the country tag on the registration/sync record.

**Acceptance Scenarios**:

1. **Given** Mexico quota targets exist and at least one dimension has room, **When** a Mexico lead
   matches an open dimension within its region, **Then** the lead is accepted and advanced to panel
   registration.
2. **Given** a Mexico region whose aggregate cap is reached, **When** a new Mexico lead in that region
   qualifies on a dimension, **Then** the lead is recorded as quota-exhausted and not registered.
3. **Given** a México household reporting a pregnancy or a baby aged 0–36 months, **When** the quota
   decision runs, **Then** the lead is accepted regardless of NSE level, age band, household size, or
   region cap.
4. **Given** an accepted México lead, **When** it is synced to the downstream panel/TDM system,
   **Then** the record identifies the country as "México" and carries the México NSE region and level.

---

### User Story 5 - México appears in the admin quota and leads tooling (Priority: P3)

Admin users can create and view México quota targets and region caps, and can filter the leads
dashboard by México and its regions, using the same screens already used for CAM countries.

**Why this priority**: Operational convenience for the research team; the core recruitment funnel works
without it as long as Mexico quota configuration can be loaded.

**Independent Test**: In the admin quota screen, select México, confirm the México region list and NSE
levels are offered, create a target and a region cap, and confirm the leads dashboard filters by
México.

**Acceptance Scenarios**:

1. **Given** the admin quota screen, **When** the user selects country "México", **Then** the region
   dropdown lists the México Kantar regions and the NSE dimension offers the México levels
   ("AB", "C+", "C", "D+", "D/E").
2. **Given** the leads dashboard, **When** the user filters by country "México", **Then** only México
   leads are shown and the region filter offers México regions.

---

### Edge Cases

- Household shares GPS coordinates that reverse-geocode to a country other than México → handled by
  the existing country-mismatch behavior; the flow does not silently switch instruments.
- Municipio name that exists in more than one Estado (e.g. "Centro", "Bolívar") → disambiguation must
  use the Estado the household already provided.
- Household provides a Código Postal but an unclear Municipio → the Municipio question is asked once
  more; if it still does not resolve to a catalog entry, the lead is flagged out of geographic quota
  (see Assumptions). No CP→Municipio dataset is used in this feature.
- "Posgrado Incompleto" and "Posgrado Completo / Diplomado / Maestría / Doctorado" both carry the
  maximum education points — the answer list must include both options.
- "Alfabetizado pero no en escuela formal" and "Sin instrucción escolar" both score zero education
  points.
- A scoring answer is missing or "No sé / No recuerdo" → that variable contributes zero points and the
  flow continues (matches current CAM tolerance for missing scoring inputs). A resulting total below
  the workbook's lowest observed value (6), including an all-zero total, maps to "D/E"; the lead is
  not marked "incomplete" solely for a low score (see Assumptions).
- The internet scoring question explicitly excludes mobile-only connections; the answer must reflect
  fixed/home internet only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST recognize a household as being in Mexico and, from that point, drive the
  conversation with Mexico questionnaire content (screening, "Origen", household profile, address,
  socioeconomic questions) sourced from `docs/mexico/Cuestionario Mexico.docx`.
- **FR-002**: The system MUST screen out a Mexico household when any member works in a sensitive
  industry listed in the Mexico questionnaire (advertising agency; market research company;
  radio/press/TV; owner of an industry or business in food, beverages, personal hygiene, home
  cleaning, clothing, or footwear), producing the standard "not qualified" outcome.
- **FR-003**: The system MUST collect the México Phase-1 household-profile fields in the survey — the
  respondent's given and family name, gender, age, household size, pregnancy status, and whether a
  baby aged 0–36 months lives in the household — with México questionnaire wording and options.
  Whether the additional per-member data the México questionnaire asks for (names of the other
  household adults and their personal phone + email) is captured in this feature or deferred to a
  separate "México ficha del hogar" feature is decided by a scoping spike (tasks T003a): the bot has
  no per-member data model today. If captured, it is limited to name + phone + email, persisted as a
  minimal member store, with third-party-data handling per FR-022 / FR-024. All other Phase-4 "ficha
  del hogar" content — relationship to head of household, per-member sex/date of birth,
  permanent-disability status, and the unlimited mobile-data-package question — is out of scope for
  this feature (see Assumptions).
- **FR-004**: The system MUST ask for the Mexico address using Estado → Municipio → Código Postal, plus
  Colonia and free-text street address (calle, número exterior, número interior, complemento).
- **FR-005**: The system MUST validate Mexico landline and mobile phone numbers as 10-digit numbers and
  accept an optional additional contact number.
- **FR-006**: The system MUST resolve a Mexico household's Estado/Municipio (or shared location) to
  exactly one Mexico NSE region (Kantar region) defined in
  `docs/mexico/Muestra Regiones NSE Mexico.xlsx`.
- **FR-007**: The system MUST treat a Mexico address that does not match any catalog entry as out of
  geographic quota and MUST NOT advance such a lead to a quota decision.
- **FR-008**: The system MUST compute a Mexico socioeconomic point total as the sum of the point values
  of the answers to the six Mexico scoring variables (household head's highest completed schooling;
  number of full bathrooms with shower and toilet; number of cars/vans; whether the home has
  non-mobile internet; number of household members aged 14+ who worked in the last month; number of
  rooms used for sleeping), using the point tables in the reference workbook.
- **FR-009**: The system MUST map the México point total to an NSE level using the cutoffs: below 100
  → "D/E" (the workbook's lowest band is labelled "6–99"; totals of 0–5 from missing answers also map
  to "D/E"), 100–140 → "D+", 141–167 → "C", 168–201 → "C+", 202 and above → "AB".
- **FR-010**: The system MUST use the Mexico NSE level (never an SCL-CAM segment) as the socioeconomic
  input to the Mexico quota decision, and MUST record it on the lead.
- **FR-011**: The system MUST evaluate México leads against México quota configuration only — México
  quota targets, México region caps, and México NSE levels — and MUST NOT compare a México lead
  against another country's quota cells or region caps. (This is the canonical statement of country
  isolation for México; FR-016 states the converse — no existing country's behavior changes.)
- **FR-012**: The system MUST apply, for Mexico, the same flexible-quota rules already defined for the
  platform: OR-combined independent dimensions (NSE level, age band, household size); every region open
  for recruitment; a per-region aggregate cap that blocks new registrations when reached; and an
  unlimited, always-qualifying path for a household reporting a pregnancy or a baby aged 0–36 months.
- **FR-013**: The system MUST route an accepted México lead into the existing panel registration and
  downstream sync flow, with the record identifying the country as "México" and carrying the México
  NSE region and NSE level.
- **FR-014**: The system MUST allow admin users to create and view México quota targets and México
  region caps (`quota_targets.country` / `quota_region_caps.country` = "México"), offering the México
  region list and México NSE levels in those screens.
- **FR-015**: The system MUST allow admin users to filter the leads dashboard by country "México" and
  by México region.
- **FR-016**: The system MUST NOT change questionnaire content, scoring, geography resolution, or quota
  behavior for any existing (CAM / Dominican Republic) country as a result of this feature.
- **FR-017**: The system MUST record enough detail on each Mexico lead to audit the NSE outcome: the
  individual scoring answers, their point contributions, the point total, and the resulting NSE level.

### Compliance Requirements — Meta / WhatsApp Policy & Data Protection

*(Folded in from `checklists/meta-compliance.md`. These are release-gating for Mexico go-live.)*

- **FR-018**: The feature MUST enumerate every Meta-approved WhatsApp message template the Mexico flow
  will send, decide per template whether a Mexico-localized variant is required, and — for any
  variant — obtain Meta approval (approved status, unchanged category, correct `es`/`es_MX` language
  tag) **before** Mexico go-live, without disturbing the pending `registration_instructions`
  resubmission or any existing CAM or Ecuador template.
- **FR-019**: All new Mexico session-message content — question wording, answer-option lists, and the
  broadened conflict-of-interest / screening list (which now also excludes owners of clothing and
  footwear businesses), as finalized in `docs/mexico/Cuestionario Mexico.docx` — MUST be reviewed and
  signed off against the WhatsApp Business Messaging Policy and the WhatsApp Commerce Policy before
  release, with no incentive/prize wording that reclassifies a template category.
- **FR-020**: The existing opt-in + Terms & Conditions consent gate MUST be reused unchanged for
  Mexico; no Mexico path may collect any survey answer before consent is recorded.
- **FR-021**: The privacy notice ("aviso de privacidad") / T&C text MUST be assessed for adequacy
  under Mexico's Ley Federal de Protección de Datos Personales en Posesión de los Particulares
  (LFPDPPP) — required aviso-de-privacidad content, the option to limit use/disclosure, and ARCO
  rights — and any localized or amended text MUST be legally approved before go-live. Pregnancy and
  permanent-disability answers MUST be treated as "datos personales sensibles" (which under LFPDPPP
  require explicit consent), and their handling stated explicitly.
- **FR-022**: If the T003a scoping spike keeps per-member data in this feature (the México
  questionnaire asks for **other household members'** personal phone and email), the feature MUST
  define the lawful basis and disclosure for collecting third-party contact data and MUST specify
  retention / deletion for both panelist and household-member personal data. If the spike defers
  per-member data, this feature collects no third-party contact data and MUST record that decision.
  Retention / deletion for the panelist's own personal data MUST be specified either way.
- **FR-023**: The feature MUST assert — and verify via regression — that re-engagement cadence, the
  single re-engagement-attempt cap, the outbound-without-reply ceiling, opt-out / STOP handling, and
  24-hour customer-care-window behavior are unchanged for Mexico, and that Mexico introduces no new
  business-initiated (outside-24-hour) messages beyond existing approved templates.
- **FR-024**: The plan's Constitution Principle I assessment MUST name the specific México free-text
  fields sent to the LLM extraction path (street address, Código Postal, and — only if the T003a
  spike keeps per-member data in scope — member name/email), document the justification for sending
  that PII (including any third-party contact data) to the external LLM provider, and — under that
  spike outcome — MUST capture member phone/email as structured input rather than free-text so
  third-party PII never enters an LLM prompt. Existing sanitization and prompt-injection mitigations
  MUST apply unchanged.
- **FR-025**: WhatsApp-channel behaviour MUST be regression-verified for the new México content —
  including the numbered-choice / button-fallback path, WhatsApp message-length and button-count
  limits given México's long education option list, and — if the T003a spike keeps the roster in
  scope — the multi-member roster prompts.
- **FR-026**: A named compliance / legal owner MUST sign off the Meta-policy and LFPDPPP items, and
  that sign-off MUST be a blocking go/no-go gate before Mexico go-live, tracked as explicit tasks.
- **FR-027**: Assumptions about the Meta account's standing for the Mexico rollout (phone-number
  quality tier, per-number messaging limits, phased ramp-up) MUST be documented and validated.
- **FR-028**: The feature MUST state which compliance items are satisfied once for the platform
  (shared with feature 014) versus which MUST be repeated per country — at minimum template approval
  and legal sign-off are per-country.

### Key Entities *(include if feature involves data)*

- **Mexico country configuration**: The bundle that makes Mexico a supported market — its questionnaire
  content set, its NSE scoring instrument (variables, point tables, level cutoffs), its region catalog,
  and its phone-format rules.
- **Mexico NSE region catalog entry**: A mapping of REGION / Region Kantar / ESTRATO → Estado →
  Municipio used to resolve an address to a Kantar region. Regions include AMCM (Área Metropolitana de
  la Ciudad de México), Centro, Sureste, and the other Kantar regions present in the workbook.
- **Mexico NSE scoring variable**: One of the six questions, each with an ordered list of answer
  options and an integer point value per option.
- **Mexico NSE level**: The banded result ("AB", "C+", "C", "D+", "D/E") derived from the point total;
  the socioeconomic dimension for quota matching.
- **México lead / survey profile**: An existing lead and household profile whose country is "México",
  carrying México geography (Estado/Municipio/Código Postal/Colonia), the resolved Kantar region, the
  scoring answers and point total, and the NSE level.
- **México quota target / region cap**: Existing quota-configuration entities scoped to country
  "México", by México region and México NSE level / age band / household size.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Mexican household can complete the entire flow — screening through quota decision — in
  a single conversation, with 100% of prompts and answer options matching the approved Mexico
  questionnaire.
- **SC-002**: For the worked example in the reference workbook and for at least 20 additional
  constructed households, the computed point total and NSE level match the reference workbook exactly
  (100% agreement).
- **SC-003**: For a validation set of at least 30 real Mexican addresses across the AMCM, Centro, and
  at least one other Kantar region, at least 95% resolve to the correct region, and every address
  outside the catalog is flagged out of geographic quota.
- **SC-004**: Running the existing CAM regression scenarios after this feature produces identical
  questionnaire content, scores, and quota decisions to before (zero diffs).
- **SC-005**: A research-team admin can configure a complete set of Mexico quota targets and region
  caps and see Mexico leads flow into the correct cells, with no engineering involvement, within one
  working day of go-live.
- **SC-006**: 100% of accepted México leads arrive in the downstream panel/TDM system tagged with
  country "México" and a populated NSE region and NSE level.
- **SC-007**: México go-live is gated by a single "México launch readiness" checklist that is 100%
  green before release — every required WhatsApp template in approved status, the session-message
  content review signed off against the WhatsApp Business and Commerce policies, the LFPDPPP / consent
  legal sign-off recorded (including third-party-contact sign-off only if the T003a spike keeps the
  roster in scope), and the CAM + Ecuador + WhatsApp regression suites green — each item attributed to
  a named approver.

## Assumptions

- The canonical country name written to the lead record, `quota_targets.country` / `quota_region_caps.country`,
  the admin dropdowns, the leads-dashboard filter, and the downstream sync payload is **"México"**
  (accented), matching the existing catalog convention (`Panamá`, `Rep. Dominicana`). Descriptive
  English prose in this document may still read "Mexico"/"Mexican"; the identifier value is "México".
- México is offered on the same conversational channels already supported by the bot; no new channel
  is introduced by this feature.
- The existing lead, survey-profile, quota-engine, panel-registration, and TDM-sync capabilities are
  reused; this feature adds México configuration and México-specific scoring/geography logic, not a
  parallel pipeline.
- Country detection reuses the platform's existing mechanism (shared location reverse-geocoding and/or
  an explicit country signal); defining a new detection method is out of scope.
- The collapsed "NSE MEXICO" level set ("AB", "C+", "C", "D+", "D/E") from the reference workbook is
  the level used for quota. The raw point total is also stored (as `nse_points`) for audit. The finer
  AMAI A/B/C+/C/D+/D/E table is informational and is not stored or used.
- The education scoring variable uses the highest completed schooling of the head of household (jefe o
  jefa de hogar), as worded in the México questionnaire.
- "Estrato" (ESTRATO in the catalog) is carried as an attribute of the region catalog entry; the quota
  decision keys on the Kantar region name only, not on Estrato.
- Phone numbers are validated as 10 digits with no international-prefix handling beyond stripping a
  leading country code / legacy mobile prefix / leading zero if present.
- When a Municipio cannot be determined but a valid 5-digit Código Postal is provided, the Municipio
  question is asked once more; if it still does not resolve to a catalog entry, the lead is flagged
  out of geographic quota. (A CP→Municipio dataset is not in `docs/mexico/`; adding one is a later
  change.)
- Missing or "No sé / No recuerdo" scoring answers contribute zero points, consistent with current CAM
  behavior. A resulting point total below the workbook's lowest observed value (6) — including an
  all-zero total — maps to "D/E"; such a lead is not marked "incomplete" solely for a low score.
- The bot has **no per-member household data model today** — the current ficha-del-hogar flow is a
  single respondent-only record. Whether this feature captures the México questionnaire's per-member
  data (names of the other household adults + their phone/email) or defers it to a separate "México
  ficha del hogar" feature is decided by a scoping spike (tasks T003a). If captured, it is limited to
  name + phone + email in a minimal member store (needs migration `0016`), with third-party-data
  handling per FR-022 / FR-024. The recommended default is to defer. Everything else in the Phase-4
  ficha del hogar — relationship to head of household, per-member sex/date of birth,
  permanent-disability status, and the unlimited-data-package question — is out of scope regardless
  and runs country-agnostic after registration.
- Ecuador onboarding is tracked as a separate feature and is out of scope here.
- The Mexico region catalog and NSE point tables are frozen as of the versions in `docs/mexico/`;
  later updates to the sample design are a separate change.

## Dependencies

- Approved Mexico questionnaire: `docs/mexico/Cuestionario Mexico.docx`.
- Approved Mexico region + NSE workbook: `docs/mexico/Muestra Regiones NSE Mexico.xlsx`.
- Platform constitution v1.2.0, Principle V (Country-Scoped Recruitment Configuration) and Principle IV
  (Flexible Quota Eligibility).
- Existing quota engine, admin quota tooling, leads dashboard, panel-registration flow, and TDM sync.
- Shares the country-configuration approach with the Ecuador onboarding feature (`specs/014-ecuador-onboarding`);
  common groundwork should be built once and reused.
- A named compliance / legal owner for the Meta-policy and Mexico LFPDPPP sign-off (FR-026), including
  the third-party-contact-data question (FR-022) — external to engineering; their approval blocks go-live.
- Meta / WhatsApp template review turnaround for any Mexico-localized template (FR-018) — a scheduling
  dependency on Meta, outside the team's control.
- Compliance checklist: `specs/015-mexico-onboarding/checklists/meta-compliance.md`.
