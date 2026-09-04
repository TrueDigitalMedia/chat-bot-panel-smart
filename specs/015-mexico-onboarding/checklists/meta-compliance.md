# Checklist: Meta / WhatsApp Policy Compliance — Requirements Quality

**Purpose**: Unit-test the *requirements* for feature 015 (Mexico Onboarding) on whether they
adequately specify how the chatbot stays within Meta's WhatsApp Business Messaging Policy, WhatsApp
Commerce Policy, template rules, and Mexican data-protection law (LFPDPPP). Tests what the spec/plan
*says*, not the running system.

**Created**: 2026-09-03
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [tasks.md](../tasks.md)
**Depth**: Formal (release gate) · **Audience**: feature reviewer + compliance/legal owner
**Scope note**: As written today, feature 015 has **no** section addressing any of the items below —
expect most items to resolve as `[Gap]`. This checklist exists to force that gap closed before Mexico
go-live.

**Resolution (2026-09-03)**: The surviving gaps were folded into the spec as **FR-018–FR-028** and
**SC-007** (`spec.md` → "Compliance Requirements — Meta / WhatsApp Policy & Data Protection"), and
into `tasks.md` as **Phase 9 (T042–T051, RELEASE GATE)**. Work the individual CHK items below with the
compliance owner against those FRs; T051 tracks closing this checklist.

## WhatsApp Template Inventory & Approval

- [ ] CHK001 Does the spec identify every Meta-approved WhatsApp message template the Mexico flow will send (registration instructions, re-engagement, code delivery, etc.)? [Completeness, Gap]
- [ ] CHK002 Is there a requirement stating whether any template needs a new Mexico-localized variant, and if so that it MUST be Meta-approved before Mexico go-live? [Gap, Spec §Dependencies]
- [ ] CHK003 Are the acceptance criteria for "template approved" measurable (approved status, unchanged category, correct `es_MX`/`es` language tag)? [Measurability, Gap]
- [ ] CHK004 Does the spec cross-reference the pending `registration_instructions` template resubmission so Mexico launch is not blocked on / does not regress it? [Traceability, Gap]
- [ ] CHK005 Is the boundary explicit — which Mexico messages are *session* messages vs *template* messages? [Clarity, Gap]
- [ ] CHK006 Are requirements defined for the template `language` value used for Mexico and its consistency with existing CAM and Ecuador (014) templates? [Consistency, Gap]

## Session-Message Content vs. Business & Commerce Policy

- [ ] CHK007 Is there a requirement that all new Mexico session-message content (question wording, answer-option lists, screening message) is reviewed against the WhatsApp Business Messaging Policy before release? [Gap]
- [ ] CHK008 Does the spec state the review must also cover the WhatsApp Commerce Policy? [Completeness, Gap]
- [ ] CHK009 Are the exact final Mexico strings (or their single source of truth, `docs/mexico/Cuestionario Mexico.docx`) referenced so the reviewed content is unambiguous and version-pinned? [Clarity, Spec §Overview]
- [ ] CHK010 Is the broadened conflict-of-interest / screening list (adds food, beverages, hygiene, cleaning, **clothing, footwear** — industry owners) in scope of the policy review, with its wording specified rather than paraphrased? [Coverage, Spec FR-002]
- [ ] CHK011 Are requirements defined for how the bot discloses sender identity / purpose per Meta's business-identity expectations for the Mexico market? [Gap]
- [ ] CHK012 Is there a requirement that Mexico content introduces no incentive/prize language that would reclassify a template category or breach Commerce Policy? [Gap, Assumption]

## Consent, Sensitive Data & Mexico LFPDPPP

- [ ] CHK013 Does the spec state that the existing opt-in + T&C consent gate is reused unchanged for Mexico and that no new flow bypasses it (FR-010-equivalent)? [Consistency, Gap]
- [ ] CHK014 Are the new/expanded personal data points enumerated — pregnancy status, permanent-disability status, home internet, and **per-member personal phone + email captured in the household roster** (research R8)? [Completeness, Spec FR-003 / research R8]
- [ ] CHK015 Is there a requirement that the privacy notice / T&C ("aviso de privacidad") is assessed for adequacy under Mexico's LFPDPPP, including the mandatory aviso de privacidad content, the option to limit use/disclosure, and ARCO rights? [Gap]
- [ ] CHK016 Does the spec define whether consent copy must be re-localized/amended for Mexico, with a measurable "approved by legal" acceptance criterion? [Measurability, Gap]
- [ ] CHK017 Is capturing a **third party's** contact details (other household members' phone/email) called out as needing its own lawful basis / disclosure, or explicitly deferred with rationale? [Gap, Risk]
- [ ] CHK018 Are retention / deletion requirements for Mexico panelist and household-member personal data specified, or explicitly deferred? [Gap]
- [ ] CHK019 Is health-related data (pregnancy, disability) called out for any heightened handling requirement (LFPDPPP "datos sensibles" → explicit written consent), or is its treatment stated to be identical to other fields? [Clarity, Gap, Conflict-risk]
- [ ] CHK020 Are requirements defined for what the bot does if a Mexico user declines consent or asks how their data is used mid-flow (FAQ / exit copy for Mexico)? [Coverage, Edge Case, Gap]

## Re-engagement, Opt-out & the 24-Hour Window

- [ ] CHK021 Does the spec explicitly assert that re-engagement cadence, the single-attempt cap, and the outbound-without-reply ceiling are **unchanged** by feature 015? [Gap, Spec FR-016]
- [ ] CHK022 Is there a requirement that opt-out / STOP handling behaves identically for Mexico leads as for CAM/Ecuador leads? [Consistency, Gap]
- [ ] CHK023 Does the spec state that Mexico introduces no new business-initiated (outside-24h) messages beyond existing approved templates? [Gap]
- [ ] CHK024 Are the acceptance criteria for "unchanged re-engagement/opt-out" measurable (covered by the WhatsApp regression suite, zero diff)? [Measurability, Gap]
- [ ] CHK025 Is quality-rating risk addressed — a requirement that new Mexico content will not raise block/report rates (content review + phased rollout)? [Gap, Risk]

## PII to External LLM (Constitution Principle I)

- [ ] CHK026 Does the spec/plan identify which new Mexico free-text fields reach the LLM extraction path (street address, Código Postal, and any roster free-text incl. member email)? [Completeness, Plan §Constitution Check]
- [ ] CHK027 Is there a requirement documenting the justification for sending Mexico address + third-party member contact free-text to the external LLM provider, per Principle I? [Gap, Constitution I]
- [ ] CHK028 Are requirements defined for whether member phone/email should be captured as structured input (not free-text) to keep third-party PII out of the LLM prompt? [Clarity, Gap]
- [ ] CHK029 Is the existing input-sanitization / prompt-injection mitigation stated to apply unchanged to the new Mexico fields? [Consistency, Plan §Constitution Check]
- [ ] CHK030 Does the plan's Principle I assessment specifically name the Mexico data flow (incl. the roster) rather than asserting "no new LLM surface" generically? [Accuracy, Plan §Constitution Check]

## WhatsApp-Channel Regression Parity

- [ ] CHK031 Does the spec require that WhatsApp-channel behavior (not only Telegram) is regression-verified for the new Mexico content? [Gap, Spec SC-004]
- [ ] CHK032 Is the WhatsApp button-fallback / numbered-choice path in scope of the Mexico regression requirements (long education option list)? [Coverage, Gap]
- [ ] CHK033 Are acceptance criteria defined for WhatsApp message-length / button-count limits given Mexico's option lists and the multi-member roster prompts? [Measurability, Gap]
- [ ] CHK034 Is there a requirement that the CAM and Ecuador WhatsApp templates and their approved status are untouched by the Mexico changes? [Consistency, Spec FR-016]

## Ownership, Traceability & Release Gating

- [ ] CHK035 Is a compliance owner / approver named for the Meta-policy and LFPDPPP sign-off before Mexico go-live? [Gap, Traceability]
- [ ] CHK036 Are the compliance items represented as blocking tasks in `tasks.md` (not just prose), with a go/no-go gate? [Gap, Traceability]
- [ ] CHK037 Is there a single measurable "Mexico launch readiness" criterion aggregating template approval + content review + legal sign-off + regression green? [Measurability, Gap]
- [ ] CHK038 Are assumptions about Meta account standing (phone-number quality tier, messaging limits) for the Mexico rollout documented and validated? [Assumption, Gap]
- [ ] CHK039 Since 015 shares groundwork with 014, is it specified which compliance items are covered once (shared) vs. must be repeated per country (template approval, legal sign-off)? [Clarity, Gap]
