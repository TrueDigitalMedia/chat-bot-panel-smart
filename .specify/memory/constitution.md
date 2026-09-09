<!--
SYNC IMPACT REPORT
Version change: 1.1.0 → 1.2.0
Modified principles:
  - IV. Flexible Quota Eligibility → IV. Flexible Quota Eligibility (expanded: quota
    dimensions, regions, and the pregnancy/baby exception are now explicitly evaluated
    per country using that country's own NSE scoring system)
Added sections:
  - Core Principles — V. Country-Scoped Recruitment Configuration (new)
Removed sections: N/A
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ Reviewed — Constitution Check is generic
    ("[Gates determined based on constitution file]"); no edit required
  - .specify/templates/spec-template.md ✅ Reviewed — generic structure applies; no changes needed
  - .specify/templates/tasks-template.md ✅ Reviewed — generic structure applies; no changes needed
Follow-up TODOs:
  - specs/014 (or next available number): formalize Ecuador onboarding via /speckit-specify —
    Ecuador INEC point-based NSE scoring (health insurance of PSH, monthly income, dwelling
    finishes, floor material, vehicle count, PSH occupation, PSH education, internet),
    Provincia/Cantón/Parroquia geography, 10-digit phone format, region catalog
    (Guayaquil Norte/Sur, Quito Sur, Sierra, Costa Norte/Sur, Cuenca, Santo Domingo),
    NSE buckets (AB / C / 5+). Source: docs/ecuador/.
  - specs/015 (or next available number): formalize Mexico onboarding via /speckit-specify —
    Mexico AMAI-style NSE scoring (full bathrooms, cars, bedrooms, home internet, number of
    people 14+ who worked last month), Estado/Municipio/Código Postal geography, Kantar
    region / ESTRATO catalog (AMCM and others). Source: docs/mexico/.
-->

# AI Chat Platform Constitution

## Core Principles

### I. AI Safety & Guardrails (NON-NEGOTIABLE)

Every feature that produces or consumes LLM output MUST enforce explicit safety controls:

- All user inputs MUST be sanitized and validated before passing to the LLM.
- All LLM outputs MUST be validated against an allowlist of acceptable content types before display.
- Prompt injection vectors MUST be identified and mitigated in every prompt design.
- Rate limiting and abuse detection MUST be applied at the API and session layers.
- No personally identifiable information (PII) may be passed to external LLM providers without explicit
  user consent and documented justification.
- Conversation context windows MUST be bounded to prevent context poisoning.

**Rationale**: As a sales-facing AI platform, unsafe or manipulated outputs carry direct reputational
and legal risk. Safety is a gate, not an afterthought.

### II. Observability First

Every feature MUST be observable from the moment it ships:

- All LLM API calls MUST be logged with latency, token count, model version, and a correlation ID.
- Lead capture events MUST emit structured logs and be traceable end-to-end.
- Errors and LLM failures MUST be captured with full context (prompt hash, response status, session ID).
- Dashboards or structured log queries MUST be documented in the feature quickstart.
- The system MUST expose health and readiness endpoints.

**Rationale**: Sales and lead-gen outcomes depend on reliable, measurable behavior. Without
observability, failures are invisible and conversion data is untrustworthy.

### III. Simplicity / YAGNI

Complexity MUST be justified before it is introduced:

- Every abstraction MUST solve an existing, demonstrated problem — not a hypothetical future one.
- The default MUST be the simplest approach that satisfies the current requirement.
- New dependencies MUST be evaluated against existing Vercel AI SDK and Chat SDK capabilities first.
- Duplicated logic is acceptable over premature generalization until a pattern repeats three or more times.
- Architecture decisions that add complexity MUST include a documented "why not simpler?" justification.

**Rationale**: This is a new project with evolving requirements. Over-engineering early kills velocity
and makes pivots expensive.

### IV. Flexible Quota Eligibility

Panelist quota eligibility MUST be evaluated as independent, OR-combined dimensions, never as a single
combined key that all conditions must satisfy at once:

- A lead qualifies if it satisfies **at least one** available quota condition among its independent
  dimensions (NSE level, age band, household size) — matching all dimensions simultaneously MUST NOT
  be required.
- Every region MUST be open for recruitment; no region may be excluded from matching ahead of time.
- Each region MUST enforce an aggregate cap on total accepted leads, independent of per-dimension quotas,
  that blocks new registrations once reached — even if an individual dimension still has room. This
  exists to prevent over-concentration in a single region.
- A household reporting a pregnancy or a baby aged 0–36 months MUST always qualify, with no quota limit,
  regardless of NSE level, age band, or household size.
- Quota dimensions, region catalogs, and NSE levels are defined **per country** (see Principle V). A
  lead's NSE level MUST be derived from its own country's scoring system before quota evaluation, and
  quota cells, region caps, and the pregnancy/baby exception MUST be applied within that country's
  configuration — never cross-country.
- Any plan that touches `quota_targets`, region caps, NSE/SCL/AMAI scoring, or the lead capture flow
  MUST verify compliance with this principle in its Constitution Check section.

**Rationale**: Requiring simultaneous region+NSE match under-fills quotas and rejects otherwise-valid
leads that satisfy a different open dimension. The business now prioritizes filling any open quota cell
over exact combined matches, while an aggregate per-region cap keeps recruitment from concentrating in
whichever region is easiest to qualify for. Because each country uses a different NSE instrument, quota
math is only meaningful inside a single country's configuration.

### V. Country-Scoped Recruitment Configuration

The platform recruits panelists in multiple countries — currently the SCL-CAM Central America set plus
**Ecuador** and **Mexico** — and each country's onboarding MUST be driven by its own configuration, not
by a single hardcoded model:

- **NSE scoring is country-specific.** There is no universal formula. Central America uses the Kantar
  Worldpanel SCL-CAM formula; Ecuador uses the INEC point-based system (health insurance of the
  principal household earner, monthly household income, dwelling finishes, predominant floor material,
  vehicle count, earner occupation, earner education, internet access); Mexico uses the AMAI-style rule
  (full bathrooms, cars, bedrooms used for sleeping, home internet, and the number of household members
  aged 14+ who worked in the last month). Each country's scoring, its input questions, and its NSE
  cutoffs MUST be sourced from that country's reference documents (`docs/<country>/`) and covered by
  unit tests against those sources.
- **Questionnaire content is country-specific.** Origin options, address structure (e.g. Ecuador:
  Provincia/Cantón/Parroquia; Mexico: Estado/Municipio/Código Postal), phone-number format and
  validation, and answer option lists MUST match the country's approved questionnaire. Shared questions
  (pregnancy, baby under 36 months, unlimited-data package, household roster) keep uniform semantics
  across countries.
- **Geography and region catalogs are country-specific.** NSE region lookup MUST resolve within the
  lead's country catalog only. A location that is not in the country's catalog is out of geographic
  quota for that country and MUST be handled as such — never matched against another country's regions.
- **No country may be special-cased in shared code paths.** Adding or changing a country MUST be a
  configuration/data change plus its own tests; it MUST NOT require conditional branches scattered
  through the LLM prompt layer, quota engine, or lead pipeline. Any unavoidable per-country branch MUST
  be justified under Principle III.
- Every plan that adds a country, or changes scoring, questionnaire, or geo behavior, MUST state in its
  Constitution Check which countries it affects and confirm the others are unchanged.

**Rationale**: Ecuador and Mexico are outside the SCL-CAM methodology and use entirely different
socioeconomic instruments and administrative geography. Treating "the questionnaire" or "the NSE
formula" as global would silently misclassify leads and corrupt quota data. Country-scoped
configuration keeps each market correct in isolation and makes the next market an additive change.

## Technology Stack

This project is built on the following foundation. All implementation decisions MUST respect these
constraints:

- **Runtime**: Node.js with Next.js (App Router) and TypeScript — strict mode enabled.
- **AI Orchestration**: Vercel AI SDK (`ai` package) as the primary LLM interface; Chat SDK
  (`chat-sdk.dev`) for conversation state and UI primitives.
- **Deployment**: Vercel platform; edge and serverless functions preferred over always-on servers.
- **Storage**: Neon Postgres via Drizzle ORM for lead and conversation persistence — no external
  databases without documented justification. New `.sql` migrations MUST be applied to the live
  database in the same change as the schema update.
- **Testing**: Vitest for unit tests; Playwright for end-to-end flows; AI SDK core MUST NOT be
  mocked unless testing pure UI logic.
- **Styling**: Tailwind CSS; no additional CSS frameworks without explicit approval.

New dependencies MUST be discussed before adoption. The Vercel ecosystem MUST be exhausted before
reaching for third-party alternatives.

## Development Workflow

All development MUST follow this workflow to maintain quality and traceability:

- Features are specified in `/specs/[###-feature-name]/spec.md` before implementation begins.
- Code review is REQUIRED for all changes to the LLM prompt layer, lead capture logic, auth flows,
  and any country's NSE scoring or questionnaire configuration.
- Observability instrumentation is part of the definition of done — a feature is not complete without
  logs and metrics wired up.
- Lead capture paths MUST have an end-to-end test before merging to main.
- Country-specific NSE scoring MUST have unit tests that assert results against the country's
  reference documents.
- Breaking changes to the LLM prompt contract MUST be versioned and documented in the relevant spec.

## Governance

This constitution supersedes all informal conventions and verbal agreements. It is the authoritative
source of development principles for the AI Chat Platform.

- Amendments MUST be proposed as a pull request modifying this file with a version bump and rationale.
- MAJOR version bumps (removing or fundamentally redefining a principle) require documented team
  agreement before merging.
- MINOR version bumps (new principle or significant expansion) require lead developer approval.
- PATCH version bumps (clarifications, wording fixes) may be merged by any contributor.
- All feature plans MUST include a "Constitution Check" section verifying compliance with these
  principles.
- Complexity violations (deviations from Principle III) MUST be logged in the plan's Complexity
  Tracking table with explicit justification.
- Refer to `.specify/` for runtime development guidance and workflow tooling.

**Version**: 1.2.0 | **Ratified**: 2026-07-07 | **Last Amended**: 2026-09-03
