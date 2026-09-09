# Checklist: Meta / WhatsApp Policy Compliance — Requirements Quality

**Purpose**: Unit-test the *requirements* for feature 014 (Ecuador Onboarding) on whether they
adequately specify how the chatbot stays within Meta's WhatsApp Business Messaging Policy, WhatsApp
Commerce Policy, template rules, and Ecuador data-protection law (LOPDP). Tests what the spec/plan
*says*, not the running system.

**Created**: 2026-09-03
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [tasks.md](../tasks.md)
**Depth**: Formal (release gate) · **Audience**: feature reviewer + compliance/legal owner
**Scope note**: As written today, feature 014 has **no** section addressing any of the items below —
expect most items to resolve as `[Gap]`. This checklist exists to force that gap closed before Ecuador
go-live.

**Resolution (2026-09-03)**: The surviving gaps were folded into the spec as **FR-018–FR-027** and
**SC-007** (`spec.md` → "Compliance Requirements — Meta / WhatsApp Policy & Data Protection"), and
into `tasks.md` as **Phase 9 (T049–T058, RELEASE GATE)**. Work the individual CHK items below with the
compliance owner against those FRs; T058 tracks closing this checklist.

## WhatsApp Template Inventory & Approval

- [ ] CHK001 Does the spec identify every Meta-approved WhatsApp message template the Ecuador flow will send (e.g. registration instructions, re-engagement, code delivery)? [Completeness, Gap]
- [ ] CHK002 Is there a requirement stating whether any template needs a new Ecuador-localized variant, and if so that it MUST be Meta-approved before Ecuador go-live? [Gap, Spec §Dependencies]
- [ ] CHK003 Are the acceptance criteria for "template approved" measurable (approved status in the template store, category unchanged, language tag correct)? [Measurability, Gap]
- [ ] CHK004 Does the spec cross-reference the pending `registration_instructions` template resubmission so Ecuador launch is not blocked on / does not regress it? [Traceability, Gap]
- [ ] CHK005 Is the boundary explicit — which Ecuador messages are *session* messages (no template needed) vs *template* messages (approval needed)? [Clarity, Gap]
- [ ] CHK006 Are requirements defined for the template `language` / locale value used for Ecuador (e.g. `es` vs `es_EC`) and its consistency with existing CAM templates? [Consistency, Gap]

## Session-Message Content vs. Business & Commerce Policy

- [ ] CHK007 Is there a requirement that all new Ecuador session-message content (question wording, answer-option lists, screening message) is reviewed against the WhatsApp Business Messaging Policy before release? [Gap]
- [ ] CHK008 Does the spec state the review must also cover the WhatsApp Commerce Policy (prohibited/restricted goods & data-solicitation rules)? [Completeness, Gap]
- [ ] CHK009 Are the exact final Ecuador strings (or their single source of truth, `docs/ecuador/Cuestionario Ecuador.docx`) referenced so the reviewed content is unambiguous and version-pinned? [Clarity, Spec §Overview]
- [ ] CHK010 Is the expanded conflict-of-interest / screening message content in scope of the policy review, and is its wording specified rather than paraphrased? [Coverage, Spec FR-002]
- [ ] CHK011 Are requirements defined for how the bot's messages disclose sender identity / purpose per Meta's business-identity expectations for the Ecuador market? [Gap]
- [ ] CHK012 Is there a requirement that Ecuador content does not introduce incentives/prize language that would reclassify the template category or violate Commerce Policy? [Gap, Assumption]

## Consent, Sensitive Data & Ecuador LOPDP

- [ ] CHK013 Does the spec state that the existing opt-in + T&C consent gate is reused unchanged for Ecuador and that no new flow bypasses it? [Consistency, Gap]
- [ ] CHK014 Are the new sensitive data points enumerated as such (monthly income bracket, health-insurance provider of the PSH, pregnancy status, permanent-disability status)? [Completeness, Spec FR-003 / FR-008]
- [ ] CHK015 Is there a requirement that the privacy notice / T&C text is assessed for adequacy under Ecuador's Ley Orgánica de Protección de Datos Personales (LOPDP), including lawful basis and data-subject rights? [Gap]
- [ ] CHK016 Does the spec define whether the current consent copy must be re-localized or amended for Ecuador, with a measurable "approved by legal" acceptance criterion? [Measurability, Gap]
- [ ] CHK017 Are retention / deletion requirements for Ecuador panelist personal data specified, or explicitly deferred with rationale? [Gap]
- [ ] CHK018 Is health-related data (pregnancy, disability, health insurance) called out for any heightened handling requirement, or is its treatment stated to be identical to other survey fields? [Clarity, Gap]
- [ ] CHK019 Are requirements defined for what the bot does if an Ecuador user declines consent or asks how their data is used mid-flow (FAQ / exit copy in Spanish for Ecuador)? [Coverage, Edge Case, Gap]

## Re-engagement, Opt-out & the 24-Hour Window

- [ ] CHK020 Does the spec explicitly assert that re-engagement cadence, the single-attempt cap, and the outbound-without-reply ceiling are **unchanged** by feature 014? [Gap, Spec FR-016]
- [ ] CHK021 Is there a requirement that opt-out / STOP handling behaves identically for Ecuador leads as for CAM leads? [Consistency, Gap]
- [ ] CHK022 Does the spec state that Ecuador introduces no new business-initiated (outside-24h) messages beyond existing approved templates? [Gap]
- [ ] CHK023 Are the acceptance criteria for "unchanged re-engagement/opt-out" measurable (e.g. covered by the WhatsApp regression suite, zero diff)? [Measurability, Gap]
- [ ] CHK024 Is quality-rating risk addressed — a requirement that new Ecuador content will not increase block/report rates (e.g. content review + phased rollout)? [Gap, Risk]

## PII to External LLM (Constitution Principle I)

- [ ] CHK025 Does the spec/plan identify which new Ecuador free-text fields are sent to the LLM extraction path (full address, and any income/education free-text)? [Completeness, Plan §Constitution Check]
- [ ] CHK026 Is there a requirement documenting the justification for sending Ecuador address / other PII to the external LLM provider, per Principle I? [Gap, Constitution I]
- [ ] CHK027 Are requirements defined for whether Ecuador address free-text should be minimized/redacted before extraction, or explicitly accepted as-is with rationale? [Clarity, Gap]
- [ ] CHK028 Is the existing input-sanitization / prompt-injection mitigation stated to apply unchanged to the new Ecuador fields? [Consistency, Plan §Constitution Check]
- [ ] CHK029 Does the plan's Principle I assessment specifically name the Ecuador data flow rather than asserting "no new LLM surface" generically? [Accuracy, Plan §Constitution Check]

## WhatsApp-Channel Regression Parity

- [ ] CHK030 Does the spec require that WhatsApp-channel behavior (not only Telegram) is regression-verified for the new Ecuador content? [Gap, Spec SC-004]
- [ ] CHK031 Is the WhatsApp button-fallback / numbered-choice path in scope of the Ecuador regression requirements (Ecuador has more/longer button lists)? [Coverage, Gap]
- [ ] CHK032 Are acceptance criteria defined for WhatsApp message-length / button-count limits given Ecuador's longer option lists (occupation, education)? [Measurability, Gap]
- [ ] CHK033 Is there a requirement that the CAM WhatsApp templates and their approved status are untouched by the Ecuador changes? [Consistency, Spec FR-016]

## Ownership, Traceability & Release Gating

- [ ] CHK034 Is a compliance owner / approver named for the Meta-policy and LOPDP sign-off before Ecuador go-live? [Gap, Traceability]
- [ ] CHK035 Are the compliance items represented as blocking tasks in `tasks.md` (not just prose), with a go/no-go gate? [Gap, Traceability]
- [ ] CHK036 Is there a single measurable "Ecuador launch readiness" criterion that aggregates template approval + content review + legal sign-off + regression green? [Measurability, Gap]
- [ ] CHK037 Are assumptions about Meta account standing (phone number quality tier, messaging limits) for the Ecuador rollout documented and validated? [Assumption, Gap]
