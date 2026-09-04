# Feature Specification: Ecuador Onboarding

**Feature Branch**: `feature/ecuador-mexico`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Ecuador onboarding from docs/ecuador/"

## Overview

The recruitment bot currently onboards panelists in the seven Central America / Dominican Republic
markets using the Kantar SCL-CAM socioeconomic formula. The business is expanding recruitment to
**Ecuador**, which uses a different questionnaire, a different socioeconomic (NSE) scoring instrument,
and different administrative geography. This feature adds Ecuador as a fully configured country so an
Ecuadorian household can complete the same conversational flow (screening → household profile →
address & geography → NSE scoring → quota decision → panel registration) with content and rules
correct for Ecuador, without changing behavior for existing countries.

Source of truth for all Ecuador-specific content and rules:

- `docs/ecuador/Cuestionario Ecuador.docx` — the approved Ecuador questionnaire (question wording,
  answer options, field order, address structure, phone formats).
- `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` — the Ecuador region catalog
  (Región → Provincia → Cantón → Parroquia → Parroquia Urbana), the NSE point tables for the eight
  scoring variables, and the point-total → NSE-level cutoffs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ecuadorian household completes screening and household profile (Priority: P1)

An Ecuadorian person contacts the bot (via any supported channel) and is guided through the initial
screening questions and the Phase-1 household-profile questions using Ecuador's questionnaire wording
and answer options. The household is identified as Ecuadorian and the flow uses Ecuador content from
that point on.

**Why this priority**: Nothing else in the Ecuador flow can run until the household is recognized as
Ecuadorian and the country-specific questionnaire drives the conversation. This is the minimum slice
that proves the bot can talk to an Ecuadorian panelist at all.

**Independent Test**: Run a conversation flagged as Ecuador through screening and the Phase-1
household-profile questions; confirm every prompt, answer button, and validation matches
`Cuestionario Ecuador.docx` (e.g. the "Origen" options, the sensitive-industry screener, the
respondent-profile capture), and that a CAM conversation in parallel is unchanged.

**Acceptance Scenarios**:

1. **Given** a new contact identified as being in Ecuador, **When** they start the flow, **Then** the
   screening questions, the "Origen" options, and the household questions shown are the Ecuador set,
   not the CAM set.
2. **Given** an Ecuador conversation, **When** the household reports someone working in a sensitive
   industry (advertising agency, market research, radio/press/TV, owner of a food/hygiene/cleaning
   business), **Then** the lead is screened out with the standard "not qualified" outcome.
3. **Given** an Ecuador conversation, **When** the Phase-1 household-profile questions are asked,
   **Then** the same fields the CAM Phase-1 survey collects (respondent name, gender, age, household
   size, pregnancy status, baby aged 0–36 months) are captured with Ecuador wording; the Phase-4
   "ficha del hogar" roster is unchanged and out of scope for this feature (see Assumptions).

---

### User Story 2 - Ecuador address and geography resolve to an NSE region (Priority: P1)

The Ecuadorian household provides its address using Ecuador's administrative hierarchy
(Provincia → Cantón → Parroquia, plus street address and barrio) or shares its location, and the bot
resolves it to one of the Ecuador NSE regions from the region catalog. Addresses outside the catalog
are treated as out of geographic quota.

**Why this priority**: NSE region is a required input to the quota decision. Ecuador's geography does
not fit the CAM department/municipality model, so without this the flow cannot reach a decision.

**Independent Test**: Provide a set of known Ecuador addresses (including Guayaquil and Quito
parroquias urbanas, a Sierra cantón, and an address not in the catalog) and confirm each resolves to
the expected Región or is flagged out of geographic quota.

**Acceptance Scenarios**:

1. **Given** an Ecuador conversation, **When** the household is asked where it lives, **Then** it is
   asked for Provincia, Cantón, and Parroquia (not "Departamento/Municipio").
2. **Given** a Guayaquil address in the parroquia urbana "Tarqui", **When** geography is resolved,
   **Then** the NSE region is "Guayaquil Norte".
3. **Given** a Quito address in the parroquia "Solanda", **When** geography is resolved, **Then** the
   NSE region is "Quito Sur".
4. **Given** an address whose Provincia/Cantón/Parroquia is not present in the Ecuador catalog,
   **When** geography is resolved, **Then** the lead is marked out of geographic quota and does not
   proceed to a quota decision.
5. **Given** an Ecuador phone number entry, **When** the household provides a landline or mobile
   number, **Then** it is validated as a 10-digit Ecuadorian number (area code + local number).

---

### User Story 3 - Ecuador NSE score and level are computed from the Ecuador instrument (Priority: P1)

Based on the eight Ecuador socioeconomic variables (the principal household earner's — PSH, "Principal
Sostén del Hogar" — health insurance; monthly household income; dwelling finishes; predominant floor
material; number of private vehicles; highest occupation among the PSH and the "ama de casa"; the
PSH's highest education; and internet access), the bot computes a point total and maps it to an
Ecuador NSE level. This level, not an SCL-CAM segment, is used for the Ecuador quota decision.

**Why this priority**: The NSE level is the other required input to the quota decision and is the core
reason Ecuador cannot reuse the existing scoring code.

**Independent Test**: Feed the reference household from `Muestra Regiones NSE Ecuador.xlsx` and
additional constructed cases at each cutoff boundary into the scoring, and confirm the point total and
NSE level match the transcribed point tables.

**Acceptance Scenarios**:

1. **Given** an Ecuador conversation, **When** the socioeconomic questions are asked, **Then** the
   questions, answer options, and their point values are the Ecuador set transcribed from the
   reference workbook.
2. **Given** the reference household (Issfa insurance; income $701–$1,000; cement/eternit dwelling;
   brick-or-cement floor; 0 vehicles; mid-level technician; completed university; fiber-optic home
   internet), **When** the score is computed with the transcribed point tables, **Then** the point
   total is 58 and the NSE level is "C". (The workbook's own sample row shows 52 because its *Acabados
   de la vivienda* points cell is blank; applying the table gives 58. Tests assert against the
   tables, not the 52 — see `contracts/ecuador-nse-scoring.md`.)
3. **Given** a household whose point total is at each level boundary, **When** the level is derived,
   **Then** the mapping is: total 0–50 → "D/E", 51–75 → "C", 76 and above → "AB".
4. **Given** an Ecuador lead has completed scoring, **When** its lead record is inspected, **Then**
   `quota_segment` holds an Ecuador NSE level ("AB" / "C" / "D/E") and the SCL-CAM `score` field is
   null. (The isolation rule — Ecuador leads evaluated only against Ecuador quota config — is FR-011,
   exercised in User Story 4.)

---

### User Story 4 - Ecuador lead reaches a quota decision and, if accepted, panel registration (Priority: P2)

An Ecuador lead with a resolved NSE region and NSE level is evaluated against Ecuador quota
configuration (per-dimension quotas, per-region aggregate caps, and the pregnancy / baby-under-36-
months unlimited exception), and an accepted lead is routed into the existing panel registration and
TDM sync path, tagged as Ecuador.

**Why this priority**: Completes the funnel, but depends on Stories 1–3. The quota engine and
registration path already exist; this story is about feeding them Ecuador-correct inputs and
configuration.

**Independent Test**: With Ecuador quota targets and region caps loaded, run accepted, quota-exhausted,
and pregnancy-exception leads end to end and confirm the decision, the resulting lead status, and the
country tag on the registration/sync record.

**Acceptance Scenarios**:

1. **Given** Ecuador quota targets exist and at least one dimension has room, **When** an Ecuador lead
   matches an open dimension within its region, **Then** the lead is accepted and advanced to panel
   registration.
2. **Given** an Ecuador region whose aggregate cap is reached, **When** a new Ecuador lead in that
   region qualifies on a dimension, **Then** the lead is recorded as quota-exhausted and not
   registered.
3. **Given** an Ecuador household reporting a pregnancy or a baby aged 0–36 months, **When** the quota
   decision runs, **Then** the lead is accepted regardless of NSE level, age band, household size, or
   region cap.
4. **Given** an accepted Ecuador lead, **When** it is synced to the downstream panel/TDM system,
   **Then** the record identifies the country as Ecuador and carries the Ecuador NSE region and level.

---

### User Story 5 - Ecuador appears in the admin quota and leads tooling (Priority: P3)

Admin users can create and view Ecuador quota targets and region caps, and can filter the leads
dashboard by Ecuador and its regions, using the same screens already used for CAM countries.

**Why this priority**: Operational convenience for the research team; the core recruitment funnel
works without it as long as Ecuador quota configuration can be loaded.

**Independent Test**: In the admin quota screen, select Ecuador, confirm the Ecuador region list and
NSE levels are offered, create a target and a region cap, and confirm the leads dashboard filters by
Ecuador.

**Acceptance Scenarios**:

1. **Given** the admin quota screen, **When** the user selects country "Ecuador", **Then** the region
   dropdown lists the Ecuador NSE regions and the NSE dimension offers the Ecuador levels
   ("AB", "C", "D/E").
2. **Given** the leads dashboard, **When** the user filters by country "Ecuador", **Then** only
   Ecuador leads are shown and the region filter offers Ecuador regions.

---

### Edge Cases

- Household shares GPS coordinates that reverse-geocode to a country other than Ecuador → handled by
  the existing country-mismatch behavior; the flow does not silently switch instruments.
- Household gives a Parroquia name that exists in more than one Cantón (e.g. "Bolívar", "Sucre") →
  disambiguation must use the Provincia + Cantón the household already provided.
- Household in a Guayaquil or Quito cantón but the specific parroquia urbana cannot be determined →
  the parroquia question is asked once more; if it still does not resolve to a catalog entry, the
  lead is flagged out of geographic quota (no default sub-region is assigned).
- "Post grado incompleto" and "Post grado completo" both carry the maximum education points — the
  answer list must include both options.
- A scoring answer is missing or "No sé / No recuerdo" → that variable contributes zero points and the
  flow continues (matches current CAM tolerance for missing scoring inputs).
- Ecuador income brackets are in US dollars (Ecuador's currency) — no currency conversion is applied.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST recognize a household as being in Ecuador and, from that point, drive the
  conversation with Ecuador questionnaire content (screening, "Origen", household profile, address,
  socioeconomic questions) sourced from `docs/ecuador/Cuestionario Ecuador.docx`.
- **FR-002**: The system MUST screen out an Ecuador household when any member works in a sensitive
  industry listed in the Ecuador questionnaire (advertising agency; market research company;
  radio/press/TV; owner of an industry or business in food, personal hygiene, or cleaning), producing
  the standard "not qualified" outcome.
- **FR-003**: The system MUST collect the Ecuador Phase-1 household-profile fields in the survey — the
  respondent's given and family name, gender, age, household size, pregnancy status, and whether a
  baby aged 0–36 months lives in the household — with Ecuador questionnaire wording and options. The
  interactive household roster and the additional per-member fields (relationship to head of
  household, per-member sex/date of birth, permanent-disability status, unlimited mobile-data package)
  are Phase-4 "ficha del hogar" content and are out of scope for this feature (see Assumptions).
- **FR-004**: The system MUST ask for the Ecuador address using the hierarchy Provincia → Cantón →
  Parroquia, plus free-text street address (calle, número, piso/depto) and barrio.
- **FR-005**: The system MUST validate Ecuador landline and mobile phone numbers as 10-digit numbers
  (3-digit area code + 7-digit local number) and accept an optional additional contact number.
- **FR-006**: The system MUST resolve an Ecuador household's Provincia/Cantón/Parroquia (or shared
  location) to exactly one Ecuador NSE Región defined in `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx`.
- **FR-007**: The system MUST treat an Ecuador address that does not match any catalog entry as out of
  geographic quota and MUST NOT advance such a lead to a quota decision.
- **FR-008**: The system MUST compute an Ecuador socioeconomic point total as the sum of the point
  values of the answers to the eight Ecuador scoring variables — health insurance of the principal
  household earner (PSH), monthly household income, dwelling finishes, predominant floor material,
  number of private vehicles, highest occupation, PSH's highest education, and internet access —
  using the point tables transcribed from the reference workbook. For the occupation variable the
  survey asks two questions (the PSH's occupation and the "ama de casa"'s occupation) that share one
  point table; the higher of the two point values is the occupation contribution.
- **FR-009**: The system MUST map the Ecuador point total to an NSE level using the cutoffs: 0–50 →
  "D/E", 51–75 → "C", 76 and above → "AB".
- **FR-010**: The system MUST use the Ecuador NSE level (never an SCL-CAM segment) as the socioeconomic
  input to the Ecuador quota decision, and MUST record it on the lead.
- **FR-011**: The system MUST evaluate Ecuador leads against Ecuador quota configuration only —
  Ecuador quota targets, Ecuador region caps, and Ecuador NSE levels — and MUST NOT compare an Ecuador
  lead against another country's quota cells or region caps. (This is the canonical statement of
  country isolation for Ecuador; FR-016 states the converse — no existing country's behavior changes.)
- **FR-012**: The system MUST apply, for Ecuador, the same flexible-quota rules already defined for the
  platform: OR-combined independent dimensions (NSE level, age band, household size); every region open
  for recruitment; a per-region aggregate cap that blocks new registrations when reached; and an
  unlimited, always-qualifying path for a household reporting a pregnancy or a baby aged 0–36 months.
- **FR-013**: The system MUST route an accepted Ecuador lead into the existing panel registration and
  downstream sync flow, with the record identifying the country as Ecuador and carrying the Ecuador
  NSE region and NSE level.
- **FR-014**: The system MUST allow admin users to create and view Ecuador quota targets and Ecuador
  region caps, offering the Ecuador region list and Ecuador NSE levels in those screens.
- **FR-015**: The system MUST allow admin users to filter the leads dashboard by country "Ecuador" and
  by Ecuador region.
- **FR-016**: The system MUST NOT change questionnaire content, scoring, geography resolution, or quota
  behavior for any existing (CAM / Dominican Republic) country as a result of this feature.
- **FR-017**: The system MUST record enough detail on each Ecuador lead to audit the NSE outcome: the
  individual scoring answers, their point contributions, the point total, and the resulting NSE level.

### Compliance Requirements — Meta / WhatsApp Policy & Data Protection

*(Folded in from `checklists/meta-compliance.md`. These are release-gating for Ecuador go-live.)*

- **FR-018**: The feature MUST enumerate every Meta-approved WhatsApp message template the Ecuador
  flow will send (registration instructions, re-engagement, code delivery, any others), decide per
  template whether an Ecuador-localized variant is required, and — for any variant — obtain Meta
  approval (verified as approved status, unchanged template category, correct `es`/`es_EC` language
  tag) **before** Ecuador go-live. This work MUST NOT disturb the pending `registration_instructions`
  template resubmission or any existing CAM template.
- **FR-019**: All new Ecuador session-message content — question wording, answer-option lists, and the
  expanded conflict-of-interest / screening message, as finalized in
  `docs/ecuador/Cuestionario Ecuador.docx` — MUST be reviewed and signed off against the WhatsApp
  Business Messaging Policy and the WhatsApp Commerce Policy before release, and MUST NOT introduce
  incentive/prize wording that would reclassify a template category or breach Commerce Policy.
- **FR-020**: The existing opt-in + Terms & Conditions consent gate MUST be reused unchanged for
  Ecuador; no Ecuador path may collect any survey answer before consent is recorded.
- **FR-021**: The privacy notice / T&C text MUST be assessed for adequacy under Ecuador's Ley Orgánica
  de Protección de Datos Personales (LOPDP) — lawful basis, stated purpose, data-subject rights — and
  any localized or amended text MUST be legally approved before go-live. The sensitive answers
  (monthly income bracket, health-insurance provider of the PSH, pregnancy status, permanent-
  disability status) MUST be identified as sensitive and their handling stated explicitly.
- **FR-022**: Retention and deletion requirements for Ecuador panelist personal data MUST be
  specified, or explicitly deferred with a named owner and rationale.
- **FR-023**: The feature MUST assert — and verify via regression — that re-engagement cadence, the
  single re-engagement-attempt cap, the outbound-without-reply ceiling, opt-out / STOP handling, and
  24-hour customer-care-window behavior are unchanged for Ecuador, and that Ecuador introduces no new
  business-initiated (outside-24-hour) messages beyond existing approved templates.
- **FR-024**: The plan's Constitution Principle I assessment MUST name the specific Ecuador free-text
  fields sent to the LLM extraction path (full street address; any income/education free-text) and
  document the justification for sending that PII to the external LLM provider; existing
  input-sanitization and prompt-injection mitigations MUST apply unchanged to those fields.
- **FR-025**: WhatsApp-channel behaviour MUST be regression-verified for the new Ecuador content —
  including the numbered-choice / button-fallback path and WhatsApp message-length and button-count
  limits, given Ecuador's longer option lists (occupation, education).
- **FR-026**: A named compliance / legal owner MUST sign off the Meta-policy and LOPDP items, and that
  sign-off MUST be a blocking go/no-go gate before Ecuador go-live, tracked as explicit tasks rather
  than prose.
- **FR-027**: Assumptions about the Meta account's standing for the Ecuador rollout (phone-number
  quality tier, per-number messaging limits, phased ramp-up) MUST be documented and validated.

### Key Entities *(include if feature involves data)*

- **Ecuador country configuration**: The bundle that makes Ecuador a supported market — its
  questionnaire content set, its NSE scoring instrument (variables, point tables, level cutoffs), its
  region catalog, and its phone-format rules.
- **Ecuador NSE region catalog entry**: A mapping of Región → Provincia → Cantón → Parroquia →
  Parroquia Urbana used to resolve an address to a Región. Regions include, among others, Guayaquil
  Norte, Guayaquil Sur, Quito Norte, Quito Sur, Zona Periferia/Valles, Zona Periferia GYE, Cuenca,
  Santo Domingo, Manta–Portoviejo, Costa Norte, Costa Sur, and Sierra.
- **Ecuador NSE scoring variable**: One of the eight variables, each with an ordered list of answer
  options and an integer point value per option. Seven map to one survey question each; the occupation
  variable maps to two survey questions (PSH and "ama de casa") sharing one point table, with the
  higher score counting.
- **Ecuador NSE level**: The banded result ("AB", "C", "D/E") derived from the point total; the
  socioeconomic dimension for quota matching.
- **Ecuador lead / survey profile**: An existing lead and household profile whose country is Ecuador,
  carrying Ecuador geography (Provincia/Cantón/Parroquia), the resolved Región, the scoring answers and
  point total, and the NSE level.
- **Ecuador quota target / region cap**: Existing quota-configuration entities scoped to country
  "Ecuador", by Ecuador region and Ecuador NSE level / age band / household size.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Ecuadorian household can complete the entire flow — screening through quota decision —
  in a single conversation, with 100% of prompts and answer options matching the approved Ecuador
  questionnaire.
- **SC-002**: For the reference household and for at least 20 additional constructed households at and
  around each cutoff boundary, the computed point total and NSE level match the point tables
  transcribed from `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx` exactly (100% agreement). The
  transcribed tables — not the workbook's sample rows, which may contain data-entry gaps — are the
  source of truth.
- **SC-003**: For a validation set of at least 30 real Ecuadorian addresses across Guayaquil, Quito,
  and provincial cantones, at least 95% resolve to the correct NSE Región, and every address outside
  the catalog is flagged out of geographic quota.
- **SC-004**: Running the existing CAM regression scenarios after this feature produces identical
  questionnaire content, scores, and quota decisions to before (zero diffs).
- **SC-005**: A research-team admin can configure a complete set of Ecuador quota targets and region
  caps and see Ecuador leads flow into the correct cells, with no engineering involvement, within one
  working day of go-live.
- **SC-006**: 100% of accepted Ecuador leads arrive in the downstream panel/TDM system tagged as
  Ecuador with a populated NSE region and NSE level.
- **SC-007**: Ecuador go-live is gated by a single "Ecuador launch readiness" checklist that is 100%
  green before release — every required WhatsApp template in approved status, the session-message
  content review signed off against the WhatsApp Business and Commerce policies, the LOPDP / consent
  legal sign-off recorded, and the CAM + WhatsApp regression suites green — each item attributed to a
  named approver.

## Assumptions

- Ecuador is offered on the same conversational channels already supported by the bot; no new channel
  is introduced by this feature.
- The existing lead, survey-profile, quota-engine, panel-registration, and TDM-sync capabilities are
  reused; this feature adds Ecuador configuration and Ecuador-specific scoring/geography logic, not a
  parallel pipeline.
- Country detection reuses the platform's existing mechanism (shared location reverse-geocoding and/or
  an explicit country signal); defining a new detection method is out of scope.
- The three-band NSE level ("AB", "C", "D/E") from the reference workbook's collapsed column is the
  level used for quota. The raw point total is also stored (as `nse_points`) for audit and possible
  re-banding. The finer five-level A/B/C/D/E table in the workbook is informational and is not stored
  or used.
- The occupation variable is asked as two questions — the PSH's occupation and the "ama de casa"'s
  occupation — that share one point table; the higher of the two point values is the occupation
  contribution. When only one is known, that one is used; when neither, the contribution is 0.
- When a Guayaquil or Quito household's specific parroquia urbana cannot be determined, the parroquia
  question is asked once more; if it still does not resolve to a catalog entry, the lead is flagged
  out of geographic quota. No default sub-region is assigned.
- Income brackets stay in US dollars with no conversion; "No sé / No recuerdo" and missing scoring
  answers contribute zero points, consistent with current CAM behavior.
- Phase-4 "ficha del hogar" (the interactive household roster with per-member relationship, sex, date
  of birth, permanent-disability status, and the unlimited-data-package question) is out of scope for
  this feature. It runs after registration and is treated as country-agnostic; an Ecuador-specific
  ficha del hogar is a separate feature if the research team needs one.
- Mexico onboarding is tracked as a separate feature and is out of scope here.
- The Ecuador region catalog and NSE point tables are frozen as of the versions in `docs/ecuador/`;
  later updates to the sample design are a separate change.

## Dependencies

- Approved Ecuador questionnaire: `docs/ecuador/Cuestionario Ecuador.docx`.
- Approved Ecuador region + NSE workbook: `docs/ecuador/Muestra Regiones NSE Ecuador.xlsx`.
- Platform constitution v1.2.0, Principle V (Country-Scoped Recruitment Configuration) and Principle IV
  (Flexible Quota Eligibility).
- Existing quota engine, admin quota tooling, leads dashboard, panel-registration flow, and TDM sync.
- A named compliance / legal owner for the Meta-policy and Ecuador LOPDP sign-off (FR-026) — external
  to engineering; their approval blocks go-live.
- Meta / WhatsApp template review turnaround for any Ecuador-localized template (FR-018) — a
  scheduling dependency on Meta, outside the team's control.
- Compliance checklist: `specs/014-ecuador-onboarding/checklists/meta-compliance.md`.
