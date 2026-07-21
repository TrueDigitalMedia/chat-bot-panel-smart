<!--
SYNC IMPACT REPORT
Version change: 1.0.0 → 1.1.0
Modified principles: N/A
Added sections: Core Principles — IV. Flexible Quota Eligibility (new)
Removed sections: N/A
Templates requiring updates:
  - .specify/templates/plan-template.md ⚠ Pending — Constitution Check section should reference Principle IV for any feature touching quota_targets, NSE scoring, or lead capture
  - .specify/templates/spec-template.md ✅ Reviewed — generic structure applies; no changes needed
  - .specify/templates/tasks-template.md ✅ Reviewed — generic structure applies; no changes needed
Follow-up TODOs:
  - specs/011-flexible-quota-matching (or next available number): formalize this principle into a spec via /speckit-specify — data model for per-dimension quotas (NSE, edad, integrantes), open-region matching, per-region aggregate cap, and the unlimited pregnancy/baby-under-36-months exception.
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
- This rule applies uniformly across all countries served by the platform. Any plan that touches
  `quota_targets`, NSE/SCL scoring, or the lead capture flow MUST verify compliance with this principle
  in its Constitution Check section.

**Rationale**: Requiring simultaneous region+NSE match under-fills quotas and rejects otherwise-valid
leads that satisfy a different open dimension. The business now prioritizes filling any open quota cell
over exact combined matches, while an aggregate per-region cap keeps recruitment from concentrating in
whichever region is easiest to qualify for.

## Technology Stack

This project is built on the following foundation. All implementation decisions MUST respect these
constraints:

- **Runtime**: Node.js with Next.js (App Router) and TypeScript — strict mode enabled.
- **AI Orchestration**: Vercel AI SDK (`ai` package) as the primary LLM interface; Chat SDK
  (`chat-sdk.dev`) for conversation state and UI primitives.
- **Deployment**: Vercel platform; edge and serverless functions preferred over always-on servers.
- **Storage**: Vercel KV or Vercel Postgres for lead and conversation persistence — no external
  databases without documented justification.
- **Testing**: Vitest for unit tests; Playwright for end-to-end flows; AI SDK core MUST NOT be
  mocked unless testing pure UI logic.
- **Styling**: Tailwind CSS; no additional CSS frameworks without explicit approval.

New dependencies MUST be discussed before adoption. The Vercel ecosystem MUST be exhausted before
reaching for third-party alternatives.

## Development Workflow

All development MUST follow this workflow to maintain quality and traceability:

- Features are specified in `/specs/[###-feature-name]/spec.md` before implementation begins.
- Code review is REQUIRED for all changes to the LLM prompt layer, lead capture logic, and auth flows.
- Observability instrumentation is part of the definition of done — a feature is not complete without
  logs and metrics wired up.
- Lead capture paths MUST have an end-to-end test before merging to main.
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

**Version**: 1.1.0 | **Ratified**: 2026-07-07 | **Last Amended**: 2026-07-20
