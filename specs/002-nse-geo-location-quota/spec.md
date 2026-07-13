# Feature Specification: NSE CAM Geo Location Quota

**Feature Branch**: `002-nse-geo-location-quota`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "NSE CAM geo location quota — GPS share + allowlist from Muestra Regiones NSE CAM.xlsx; hit continue / miss EXIT_B; GPS fail → text GEO with same allowlist; traceability geo_source + nse_region; no Phase 2–4 redesign / no Bloque 3 IA"

## Clarifications

### Session 2026-07-13

- Q: Where does GPS sit relative to country / department / municipality / neighborhood, and how is the resolved place confirmed? → A: Option A — GPS is requested first (before manual country selection). The system derives country, department, municipality, and neighborhood from the shared location, presents those values in a confirmation message, and the panelist must confirm. If identification fails, the bot collects the same geo fields manually via conversation (existing text/button flow).
- Q: If GPS resolves country + department + municipality but cannot identify neighborhood (barrio), what should happen? → A: Option B — Country + department + municipality are enough for a successful GPS identification and confirmation. If barrio is missing, the confirmation shows it as “No identificado” (or equivalent); after the panelist confirms, the bot asks only for neighborhood via conversation; then the NSE allowlist runs on country/department/municipality.
- Q: If the panelist rejects the GPS confirmation (“No, that’s not my location”), what should happen? → A: Option A — Rejection is treated like identification failure: collect all geo fields manually via conversation (country buttons + department + municipality + neighborhood), then apply the same NSE allowlist.
- Q: After GPS confirmation, if barrio is missing, when does the NSE allowlist run? → A: Option A — Allowlist runs immediately after GPS confirmation on country/department/municipality. Out of catalog → EXIT_B without asking barrio. In catalog and barrio missing → ask barrio only, then continue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share GPS, confirm place, continue when in allowed NSE region (Priority: P1)

A potential panelist reaches the geographic step of the recruitment survey. The bot asks them to share their device location **before** asking country/department/municipality/neighborhood manually. They share GPS. The system derives country, department/province, municipality/canton, and neighborhood (barrio), then sends a confirmation message listing those values. After the panelist confirms, the system checks the confirmed place against the NSE CAM sample catalog. On catalog match, it stores the NSE region and place names and continues the survey (skipping the manual geo questions for fields already confirmed).

**Why this priority**: This is the primary product improvement — faster, more accurate geo capture, explicit user confirmation, and correct quota assignment by NSE region.

**Independent Test**: Share a GPS point that resolves at least country/department/municipality in-catalog; confirm; if barrio missing answer that one question; verify fields + NSE region stored and survey continues without EXIT_B and without re-asking country/department/municipality.

**Acceptance Scenarios**:

1. **Given** a panelist is at the geographic step and the bot has asked for location first, **When** they share GPS that resolves at least country, department, and municipality, that municipality is in the NSE CAM catalog, **and** they confirm the summarized place, **Then** the system stores those fields plus NSE region (and neighborhood once known) and advances past the geographic gate without re-asking country/department/municipality manually.

2. **Given** GPS resolves country/department/municipality but not neighborhood and the place is in the catalog, **When** the panelist confirms, **Then** the bot asks only for neighborhood via conversation and continues after that answer.

3. **Given** GPS resolves country/department/municipality outside the catalog, **When** the panelist confirms, **Then** the bot sends EXIT_B and does not ask for neighborhood.

4. **Given** a successful GPS resolve + user confirmation + catalog match, **When** the lead is inspected in the conversation monitor or lead API, **Then** the geo source is recorded as GPS share and the NSE region is visible.

---

### User Story 2 - Confirmed GPS outside catalog closes with no quota (Priority: P1)

A panelist shares GPS, confirms the place shown (country, department, municipality, neighborhood), but the municipality is not in the NSE CAM catalog for that country. The bot closes the conversation with the same “quota full” exit used elsewhere (EXIT_B) and marks the lead as quota exhausted. The survey does not continue.

**Why this priority**: Geographic quota enforcement is a business gate; incorrect continuation would fill out-of-sample areas.

**Independent Test**: Share GPS that resolves to a place outside the catalog, confirm it; verify EXIT_B message, lead status quota exhausted, and no further survey questions.

**Acceptance Scenarios**:

1. **Given** a panelist shares GPS and confirms the presented place, **When** the municipality is not in the NSE CAM catalog for that country, **Then** the bot sends the EXIT_B message and sets lead status to quota exhausted.

2. **Given** EXIT_B was triggered by geo outside catalog, **When** the panelist sends further messages in the same conversation without restarting, **Then** the bot does not continue collecting survey answers as if still in-quota.

---

### User Story 3 - GPS fail or cancel falls back to manual geo with same allowlist (Priority: P2)

A panelist declines, cancels, or cannot share GPS, or the system cannot identify country / department / municipality / neighborhood from the location. The bot collects geography **manually via conversation** (existing country buttons + text questions, including fuzzy matching and confirmation where already used). After the municipality is resolved manually, the same NSE CAM allowlist applies: inside → continue with NSE region stored; outside → EXIT_B and quota exhausted.

**Why this priority**: Not all users can or will share GPS; manual conversation must remain a viable path without weakening quota rules.

**Independent Test**: Cancel GPS or force identification failure; complete manual geo for an in-catalog place and an out-of-catalog place; verify continue vs EXIT_B respectively, with geo source reflecting text (exact or fuzzy).

**Acceptance Scenarios**:

1. **Given** the bot asked for GPS first, **When** the panelist cancels, skips, identification of country/department/municipality fails, **or** the panelist rejects the GPS confirmation, **Then** the bot asks the existing manual location questions (country buttons, then department, municipality, neighborhood as today).

2. **Given** manual geo resolves to a municipality in the catalog, **When** validation completes, **Then** NSE region and place are stored and the survey continues; geo source reflects text (exact or fuzzy as applicable).

3. **Given** manual geo resolves to a municipality not in the catalog, **When** validation completes, **Then** the bot sends EXIT_B and sets lead status to quota exhausted (same outcome as GPS miss after confirmation).

---

### User Story 4 - Operations can see NSE region and geo source (Priority: P3)

An operator reviewing a lead in the conversation monitor or lead-facing API can see which NSE region was assigned and whether geography came from GPS share or text (exact/fuzzy), and whether the lead was inside or outside geographic quota.

**Why this priority**: Needed for QA, support, and quota analysis; does not block the panelist path but is required for operability.

**Independent Test**: Complete one GPS-in, one GPS-out, and one text-in path; confirm monitor/API fields for NSE region, geo source, and in-quota geo flag.

**Acceptance Scenarios**:

1. **Given** a lead completed geo via GPS inside catalog, **When** an operator opens that lead, **Then** they see NSE region and geo source = GPS share, and in-quota geo = true.

2. **Given** a lead exited for geo outside catalog, **When** an operator opens that lead, **Then** they see in-quota geo = false and sufficient context to know geo caused the exit.

---

### Edge Cases

- GPS shared but identification fails (cannot derive usable country / department / municipality) → treat as GPS failure and collect geo manually via conversation.
- GPS resolves country/department/municipality but not neighborhood → confirmation still offered (barrio shown as not identified); after confirm, allowlist first — if in quota ask only neighborhood; if out of quota EXIT_B without asking barrio.
- Panelist rejects GPS confirmation → discard proposal; full manual geo conversation; then allowlist (same as identification failure).
- On the manual path, allowlist likewise applies once country/department/municipality are resolved (before or without requiring neighborhood for the quota decision), consistent with the GPS path.
- GPS resolves and panelist confirms, but the place has no matching NSE CAM catalog row → outside quota → EXIT_B.
- GPS maps to a country with no sheet/rows in the NSE CAM catalog → after confirmation (or at allowlist check), outside quota → EXIT_B.
- Text/manual place names with typos that fuzzy-match to an in-catalog municipality → after confirmation (existing behavior), apply allowlist; if confirmed place is in catalog, continue.
- Text place that fuzzy-matches an out-of-catalog place → after resolution, EXIT_B.
- Panelist restarts with `/start` after EXIT_B → new conversation cycle may attempt geo again under normal reset rules of the product.
- Catalog update (new Excel version) → new allowed places take effect for subsequent leads without changing survey copy for EXIT_B.
- Multi-channel: Telegram is the V1 channel; WhatsApp uses the same business rules when a location-capable adapter exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: At the geographic step of the survey, the system MUST ask the panelist to share their device location **first**, before collecting country / department / municipality / neighborhood manually (Telegram in V1; WhatsApp when the channel supports location request).

- **FR-002**: When the panelist shares GPS, the system MUST attempt to identify country, department/province, municipality/canton, and neighborhood (barrio) from that location. Identification is considered successful when country, department/province, and municipality/canton are resolved; neighborhood MAY be missing.

- **FR-002a**: When identification succeeds, the system MUST send a confirmation message that lists country, department/province, municipality/canton, and neighborhood (showing neighborhood as “No identificado” or equivalent when missing), and MUST require the panelist to confirm before applying quota rules or advancing.

- **FR-002b**: Only after the panelist confirms the presented place MAY the system treat country, department/province, and municipality/canton as accepted for allowlist check and storage.

- **FR-002c**: After the panelist confirms the GPS place, the system MUST run the NSE CAM allowlist on country / department / municipality immediately. If the place is out of catalog, the system MUST apply EXIT_B / `quota_exhausted` and MUST NOT ask for neighborhood. If the place is in catalog and neighborhood is missing, the system MUST then ask only for neighborhood via conversation before continuing.

- **FR-002d**: If the panelist rejects the GPS confirmation, the system MUST discard the GPS-derived proposal and collect all geographic fields manually via conversation (same path as identification failure), then apply the NSE CAM allowlist.

- **FR-003**: After GPS confirmation (or after manual geo completion), the system MUST validate the place against the NSE CAM sample catalog for that country (Panamá, Guatemala, Costa Rica, El Salvador, Nicaragua, Honduras, República Dominicana).

- **FR-004**: If the place matches a catalog row, the system MUST store NSE region, country, department/province, municipality/canton, and neighborhood on the lead and continue the survey without re-asking those confirmed geo fields.

- **FR-005**: If the confirmed (or manually completed) place does not match any catalog row, the system MUST set lead status to `quota_exhausted`, send the existing EXIT_B message verbatim (same as current no-quota / D3 “No” exit), and MUST NOT continue the survey.

- **FR-006**: If the panelist cancels, declines, GPS identification of country / department / municipality fails, **or** the panelist rejects the GPS confirmation, the system MUST collect geography manually via conversation using the existing country buttons and text geographic questions (including fuzzy match and confirmation where already part of the product).

- **FR-007**: After manual geo resolves a municipality, the system MUST apply the same NSE CAM allowlist as the GPS+confirm path (match → store NSE region; if neighborhood still needed, collect it then continue; miss → EXIT_B + `quota_exhausted` without requiring neighborhood).

- **FR-008**: The system MUST record a geo source distinguishing at least: GPS share, text exact, and text fuzzy.

- **FR-009**: The system MUST expose NSE region, geo source, and whether the lead was inside geographic quota for operators via the conversation monitor and/or lead API.

- **FR-010**: The NSE CAM catalog MUST be maintained as versioned project data derived from “Muestra Regiones NSE CAM.xlsx”, so allowed places can be updated without changing EXIT_B copy or survey phase logic outside this feature.

- **FR-011**: This feature MUST NOT redesign Phases 2–4, MUST NOT add AI for Phases 2–3, and MUST NOT implement Fase 8 Bloque 2 robustness items (email, categories, name, re-engage buttons).

### Key Entities

- **NSE CAM catalog entry**: An allowed sample place for a country — NSE region label, department/province, municipality/canton (or equivalent). Source of truth for geographic quota eligibility.

- **Lead geographic profile**: Country, department/province, municipality/canton, neighborhood, NSE region (when in quota), geo source, and in-quota geo outcome for a recruitment lead.

- **GPS place proposal**: The country, department, municipality, and neighborhood values derived from a GPS share and shown to the panelist for explicit confirmation before allowlist check.

- **Geo resolution attempt**: A panelist attempt to establish location via GPS share (with confirmation) or manual conversation answers, resulting in continue, EXIT_B, or fallback to manual collection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of GPS shares that are successfully identified, confirmed by the panelist, and match an in-catalog municipality result in survey continuation without EXIT_B and without re-asking those geo fields.

- **SC-002**: 100% of confirmed GPS places or completed manual places that are outside the NSE CAM catalog for the country result in EXIT_B and do not advance past the geographic gate.

- **SC-003**: Panelists who cancel GPS or whose location cannot be identified can complete geography via manual conversation; out-of-catalog manual resolutions produce the same EXIT_B outcome as a confirmed GPS place outside the catalog.

- **SC-004**: For every lead that completes or exits at the geographic gate, an operator can see NSE region (when assigned), geo source, and in-quota geo status in the monitor or API without reading raw conversation logs.

- **SC-005**: Updating the versioned NSE CAM catalog changes which places are allowed on subsequent leads without requiring changes to EXIT_B wording.

## Assumptions

- Primary channel for V1 delivery is Telegram; WhatsApp follows the same rules when a location-capable messaging adapter exists.
- GPS is the first geo interaction; country is derived from GPS when identification succeeds, not from a prior country button in the happy path.
- Neighborhood is desirable from GPS but not required for a successful GPS identification; missing barrio is asked only after confirm **and** an in-quota allowlist result.
- On both GPS and manual paths, geographic quota is decided from country + department + municipality; neighborhood is not an allowlist key.
- Countries and allowed places are exactly those in “Muestra Regiones NSE CAM.xlsx”; any resolved place not listed is out of geographic quota (no separate “unknown country” product path beyond EXIT_B).
- Raw latitude/longitude are not retained on the lead record; only confirmed or manually collected administrative names, NSE region, geo source, and in-quota outcome are stored (privacy).
- Choice of reverse-geocoding provider is an implementation detail deferred to planning (`/speckit-plan`).
- Existing manual GEO fuzzy matching and confirmation behavior is reused on the fallback path; the NSE CAM allowlist is the geographic quota gate, not a second parallel Guatemala-only catalog for quota.
- EXIT_B text remains the existing product copy already used for quota exhausted / D3 rejection.
- Importing and versioning the Excel as static catalog data is in scope; redesign of non-geo survey questions is out of scope.

## Out of Scope

- Fase 8 Bloque 2 (email validation UX, product categories, name capitalization, re-engage with buttons).
- Fase 8 Bloque 3 (AI assistance for Phases 2–3).
- Redesign of Phases 2–4 survey content or PanelSmart registration flows.
- Changing EXIT_A / EXIT_B marketing copy (reuse existing EXIT_B).
- Building a full WhatsApp adapter if none exists yet (rules apply when the channel is available).
