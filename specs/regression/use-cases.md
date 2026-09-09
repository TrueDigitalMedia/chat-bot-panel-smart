# Regression use cases — CAM & Ecuador recruitment flow

Full-conversation ("flujo completo") scenarios asserted by the regression suites. Each row
is one `it()` that drives the whole conversation from "Hola" to a terminal lead status.

- CAM (Telegram): `tests/regression/cam-use-cases.test.ts` — via `cam-harness.runJourney`.
- Ecuador / México (WhatsApp/Twilio): `tests/regression/whatsapp/ecuador-onboarding.test.ts`
  — via `processWhatsAppInbound` (real HTTP-shaped path).
- CAM golden-master snapshot (C1, C4): `tests/regression/cam-golden-master.test.ts` — the
  byte-for-byte "nothing moved" gate; not use-case assertions.

Terminal statuses / reasons (from `phase-1.ts`):

| status | reason | trigger |
|---|---|---|
| `not_qualified` | `opt_in_decline` | declines the opt-in |
| `not_qualified` | `d1_decline` | declines the T&C gate |
| `not_qualified` | `age_minor` | age < 18 |
| `not_qualified` | `sensitive_industry` | conflict-of-interest = "Sí" — **Phase 1 for México**; **Ficha Hogar (Fase 4) for Ecuador** (moved per `flujo_kantar_ecuador.md`) |
| `quota_exhausted` | `d3_no` | not the household shopper |
| `quota_exhausted` | `survey_complete_no_quota` | finished survey, no open quota cell |
| `link_sent` | `survey_complete_quota_available` | finished survey, quota available → registration |

## Shared use cases (CAM + Ecuador)

| ID | Name | Expected outcome |
|---|---|---|
| **UC-A** | Happy path — full survey, quota available | `link_sent` (→ registration handoff); profile fully populated, `nsePoints`/`score` set |
| **UC-B** | Declines the opt-in | `not_qualified` / `opt_in_decline`; no survey data |
| **UC-C** | Declines the T&C (D1) | `not_qualified` / `d1_decline` |
| **UC-D** | Not the household shopper (D3 = no) | `quota_exhausted` / `d3_no` |
| **UC-E** | Declines re-engagement consent (optional) | survey continues normally → same as UC-A; `reEngagementConsentAccepted = false` |
| **UC-F** | Minor (age < 18) | `not_qualified` / `age_minor`, right after the age answer |
| **UC-G** | Survey completes, segment's quota cell is full | `quota_exhausted` / `survey_complete_no_quota` |
| **UC-H** | Pregnancy / baby-under-3 exception | qualifies (`link_sent`) even when the NSE cell is at 0 — the exception always passes |
| **UC-I** | Address not in the NSE catalog | survey continues; `inQuotaGeo = false`; still reaches a decision (quota via exception or `quota_exhausted`) |

## CAM-specific

| ID | Name | Expected |
|---|---|---|
| **UC-CAM1** | GPS gate → "escribir ubicación" → manual geo | country/dept/muni asked as normal questions; qualifies |
| **UC-CAM2** | Costa Rica "municipio o cantón" wording | Q4 prompt uses the Costa Rica geo label; qualifies |
| **UC-CAM3** | Guatemala departamento/zona validation | GT geo catalog validates dept + zona; qualifies |

## Ecuador-specific  (flow per `docs/ecuador/flujo_kantar_ecuador.md`)

| ID | Name | Expected |
|---|---|---|
| **UC-EC1** | Lead arrives on the Ecuador WhatsApp number (spec 017) | pre-scoped: `country = Ecuador`, `acquisition_source = whatsapp:number:Ecuador`, country question never asked |
| **UC-EC2** | Full Phase-1 survey to a decision | runs the reordered NSE block (Q11–Q21: single `occupationPsh`, `internetAccess`, 5-level A/B/C/D/E), **no Phase-1 sensitive-industry screener** (moved to Ficha Hogar); reaches a terminal status; `nsePoints` + `quotaSegment ∈ A..E` set |
| **UC-EC3** | A cantón typed for the provincia | rejected with "No reconocí esa provincia. Ejemplos: …"; not persisted; real provincia then accepted |
| **UC-EC4** | Province not in the catalog (e.g. Napo) | 1st miss → examples; 2nd miss → raw text accepted, survey continues (anti-loop hatch) |
| **UC-EC5** | Male lead → pregnancy question skipped | `isPregnant` never asked, stored `false` (`skipPregnancyWhenMale`); survey continues |
| **UC-EC6** | Every NSE button advances (no loop) | `healthInsurancePsh` / `monthlyIncome` / … / `occupationPsh` each advance `survey_question_index` (BUTTON_PREFIXES fix) |
| **UC-EC7** | Lead on the generic (CAM) WhatsApp number | NOT scoped; country question IS asked |
| **UC-MX1** | Lead on the México number, full survey | scoped to México; estado/municipio validated; México keeps `conflictOfInterest` in Phase 1; reaches a decision |
