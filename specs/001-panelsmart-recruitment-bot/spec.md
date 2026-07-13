# Feature Specification: PanelSmart Recruitment Chatbot (Treinta)

**Feature Branch**: `001-panelsmart-recruitment-bot`

**Created**: 2026-07-07

**Status**: Draft

## User Scenarios & Testing

<!--
  User journeys ordered by priority. Each is independently testable.
-->

### User Story 1 - Intake Questionnaire & Qualification (Priority: P1)

A potential panelist starts a conversation on Telegram. The bot applies **three sequential
decision points** before collecting survey data:

- **D1 — T&C acceptance**: The bot presents the Terms & Conditions link and asks for
  confirmation. Declining → EXIT_A (early rejection).
- **D2 — Prizes motivation**: The bot asks whether the user wants to earn prizes by reporting
  household purchases. Declining → EXIT_A (same exit as D1).
- **D3 — Household shopper**: The bot asks whether the user manages and organizes household
  purchases. Answering "No" → EXIT_B (quota full message, same as completing the survey with
  no available slot).

If D3 is passed, the bot collects a **16-question linear survey** (no branching within it)
covering personal data, location, and household segmentation fields. After the survey, the
system calculates a socioeconomic score and checks real-time quota availability. If no slot
is available → EXIT_B. If a slot exists → lead advances to Phase 2 (PanelSmart registration).

**Exit messages (exact text)**:

EXIT_A (D1/D2 rejection):
> "Lo sentimos 💙\nNo te preocupes que tus datos están seguros 🔒 y, si no aplicas esta vez, no te preocupes: no los usaremos ni guardaremos.\nGracias por tu interés\n💬 Si necesitas ayuda, escríbenos y nuestro equipo de atención al cliente te apoyará.\nPuedes seguir nuestras redes sociales:\nhttps://www.facebook.com/PanelSmartLatino\nhttps://www.instagram.com/panelsmart_latino/"

EXIT_B (D3 "No", quota exhausted, or survey complete with no slot):
> "😔 Lo sentimos, por ahora el cupo de panelistas en tu zona ya está completo. Agradecemos tu interés en participar.\n✨ Más adelante podría abrirse un espacio, así que mantente atent@ 💚.\n🔒 No te preocupes por la información que compartiste: al no participar, no la usaremos ni la guardaremos.\n💬 Si necesitas ayuda, escríbenos y nuestro equipo de atención al cliente te apoyará.\nPuedes seguir nuestras redes sociales y esperamos tener nuevas convocatorias muy pronto:\nhttps://www.facebook.com/PanelSmartLatino\nhttps://www.instagram.com/panelsmart_latino/"

If EXIT_B is triggered after completing the full survey (not by saying "No" at D3), the bot
appends: "🎉 ¡Gracias por tus respuestas!"

**Why this priority**: This is the entry gate for the entire funnel. All conversion metrics
depend on this step. Phases 2–6 are not reachable without completing F1.

**Independent Test**: Start a conversation, exercise each of the three decision points (D1 No,
D2 No, D3 No, D3 Yes + full survey with quota available, D3 Yes + full survey with no quota)
and verify the correct exit message and `lead_status` in the database for each path.

**Acceptance Scenarios**:

1. **Given** a user starts the conversation, **When** they decline T&C (D1), **Then** the
   bot sends the EXIT_A message verbatim and the lead status is set to `not_qualified`.

2. **Given** a user accepts T&C, **When** they decline prizes (D2), **Then** the bot sends
   the EXIT_A message and the lead status is set to `not_qualified`.

3. **Given** a user passes D1 and D2, **When** they answer "No" to D3 (not the household
   shopper), **Then** the bot sends the EXIT_B message and the lead status is set to
   `quota_exhausted`.

4. **Given** a user passes all three decision points, **When** they complete all 16 survey
   questions and quota is available, **Then** the lead status advances to `link_sent` and
   Phase 2 begins.

5. **Given** a user passes all three decision points and completes the survey, **When** no
   quota slot is available for their segment, **Then** the bot sends the EXIT_B message
   followed by "🎉 ¡Gracias por tus respuestas!" and the lead status is set to
   `quota_exhausted`.

6. **Given** a user is mid-survey and abandons (goes silent), **When** they return later,
   **Then** the bot resumes from the exact pending question without re-asking answered ones.

**The 16 survey questions (D3 = "Sí" path — linear, no branching)**:

| # | Field | Question (exact) | Input type | Options |
|---|-------|------------------|------------|---------|
| 1 | `full_name` | "Escribe tu nombre y apellido" | free text | — |
| 2 | `country` | "¿En qué país te encuentras?" | buttons | Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Rep. Dominicana, Panamá |
| 3 | `state_province` | "¿En qué provincia/departamento vives?" | free text | — |
| 4 | `municipality` | "¿En qué municipio o cantón vives?" | free text | — (bot echoes: "He entendido que tu municipio es {X}.") |
| 5 | `neighborhood` | "¿En qué parroquia, barrio o distrito vives?" | free text | — |
| 6 | `email` | "✅ ¡Perfecto! Ahora, por favor, escribe tu correo electrónico:" | free text | — |
| 7 | `gender` | "¿Cuál es tu género?" | buttons | Hombre, Mujer |
| 8 | `education_psh` | Preceded by disclaimer + "¿Cuál es el nivel educativo alcanzado por la persona que se identifica como Principal Sostén del Hogar (PSH)?" | buttons | Sin instrucción formal, Primaria Incompleta, Primaria Completa, Sec. Incompleta, Secundaria Completa, Bach. Incompleto, Bach. Completo, Univ. Incompleta, Universidad Completa, Posgrado |
| 9 | `cars` | "¿De cuántos autos dispone regularmente este hogar?" | buttons | 0, 1, 2 o más |
| 10 | `domestic_help` | "¿Este hogar cuenta actualmente con apoyo de servicio doméstico?" | buttons | Sí, No |
| 11 | `household_size` | "¿Cuántas personas residen habitualmente en este hogar?" | free text (number) | — |
| 12 | `bedrooms` | "¿Cuántas habitaciones destinadas exclusivamente para dormir tiene este hogar?" | free text (number) | — |
| 13 | `shopping_frequency` | "¿Con qué frecuencia realizas las compras para el hogar?" | buttons | Diario, 2-3 veces por semana, Semanal, Quincenal, Mensual |
| 14 | `shopping_categories` | "🛍️ ¿Cuáles de estas categorías compras en una semana típica? ... (responde con números, ej. '1,2,3,6')" | free text (multi-select) | 1. Canasta básica 2. Lácteos 3. Bebidas 4. Snacks/Botanas 5. Cuidado personal 6. Prod. de limpieza 7. Cuidado del bebé 8. Mascotas |
| 15 | `contact_channel` | "¿Cómo te gustaría ser contactado/a por PanelSmart?" | buttons | WhatsApp, Llamada telefónica |
| 16 | `contact_schedule` | "¿En qué horario del día puedes ser contactado/a?" | buttons | Mañana (9-12hs), Tarde (13-17hs), Noche (18-21hs) |

---

### User Story 2 - App Download & Registration Code Delivery (Priority: P2)

Once a lead is fully qualified with an available quota slot, the bot sends iOS and Android
download links for the PanelSmart app. It opens a 10-minute waiting window. If the user
has not activated their account within that window, the system triggers an external API call
to force-deliver the registration code via Telegram and initiates an onboarding video sequence.

**Why this priority**: This is the conversion step — turning a qualified lead into an
installed app user. Drop-off here means lost recruitment.

**Independent Test**: Can be tested by simulating a qualified lead and verifying the bot sends
links, waits the correct duration, and triggers the API call if activation is not detected.

**Acceptance Scenarios**:

1. **Given** a lead is fully qualified with quota available, **When** the system transitions
   to Phase 2, **Then** the bot sends platform-appropriate download links and the lead status
   becomes `link_sent`.

2. **Given** the bot has sent download links, **When** 10 minutes elapse without account
   activation, **Then** the system executes a PATCH API call to trigger registration code
   delivery via Telegram and begins the onboarding video flow.

3. **Given** the PATCH API call is executed, **When** the system is waiting for the code to
   be confirmed, **Then** the lead status is set to `waiting_for_code`.

---

### User Story 3 - Registration Monitoring & Routing (Priority: P3)

After the registration code is delivered, the system monitors whether the user successfully
registers in PanelSmart. Depending on the outcome, the user is routed to one of three paths:
automatic advancement to Phase 4, handoff to a human support agent, or inactivity freeze.

**Why this priority**: This step determines the final fate of each recruited lead and ensures
human agents are only engaged for genuine technical failures.

**Independent Test**: Can be tested by simulating three scenarios (successful registration,
failed registration, no response) and verifying the correct routing and status update for each.

**Acceptance Scenarios**:

1. **Given** a registration code was delivered, **When** the user successfully registers in
   PanelSmart, **Then** the lead status becomes `code_delivered_registered` and Phase 4
   is triggered automatically.

2. **Given** a registration code was delivered, **When** a technical registration error occurs,
   **Then** the chat is transferred to a human support agent and the lead status becomes
   `code_delivered_not_registered`.

3. **Given** a registration code was delivered, **When** 20 hours pass without any user
   response, **Then** the flow is frozen and the lead status becomes `code_delivered_no_response`.

---

### User Story 4 - Post-Registration Profile Confirmation (Priority: P4)

After successful PanelSmart registration, the bot confirms the panelist's profile is
complete. Because all 16 survey questions were already collected in Phase 1, no additional
demographic data collection is required. The bot generates an internal summary of Phase 1
answers for the PanelSmart platform and sends a thank-you video to mark the panelist as
fully onboarded.

**Why this priority**: Completing the onboarding loop — confirming registration and sending
the thank-you — is the final deliverable that makes the panelist actionable for Treinta's
research operations.

**Independent Test**: Can be tested by simulating a `code_delivered_registered` lead and
verifying that the AI summary is generated, the thank-you video is sent, and the lead status
becomes `ficha_hogar_completada`.

**Acceptance Scenarios**:

1. **Given** a user successfully registers in PanelSmart, **When** Phase 4 begins, **Then**
   the system generates an AI summary of the Phase 1 survey answers for internal use and
   sends it to the PanelSmart platform.

2. **Given** the summary is generated, **When** the platform confirms receipt, **Then** the
   bot sends the thank-you video and the lead status becomes `ficha_hogar_completada`.

---

### User Story 5 - Re-engagement on Inactivity (Priority: P5)

At any phase of the flow, if a user goes silent, the system schedules up to 3 outbound
Telegram push notifications using Meta-approved templates, following a strict cadence
(75 minutes, 7 hours, 20 hours). After 3 unanswered attempts, the lead is marked as
`abandono` and no further messages are sent.

**Why this priority**: Inactivity is the primary source of funnel leakage. Automated
re-engagement recovers a significant portion of leads at zero human cost.

**Independent Test**: Can be tested by simulating user inactivity and verifying that
notifications fire at the correct intervals, stop after 3 attempts, and correctly
update the lead status to `abandono`.

**Acceptance Scenarios**:

1. **Given** a user has not responded for 75 minutes, **When** the re-engagement timer
   fires, **Then** the system sends the first outbound Telegram re-engagement message.

2. **Given** the first notification was sent and still no response after 7 hours total,
   **When** the second timer fires, **Then** the system sends the second notification.

3. **Given** two notifications were sent and still no response after 20 hours total,
   **When** the third timer fires, **Then** the system sends the third and final notification,
   then sets the lead status to `abandono` regardless of outcome.

4. **Given** a user responds at any point during the re-engagement cadence, **When** the
   response is received, **Then** the system cancels all pending re-engagement timers and
   resumes the flow from the exact point where the user paused.

---

### User Story 6 - Out-of-Flow Message Handling (Priority: P6)

At any point during an active flow (D1–D3 or survey), a user may send a free-form message
that is not the expected answer to the current question. The system **does not attempt to
answer it**; instead it re-sends the pending question and, if the user is in a terminal
state or no flow is active, redirects them to the human support channel. If the FAQ bank
(75 pre-approved entries) contains a relevant answer, the system delivers it before resuming
the pending question.

**Why this priority**: Silently repeating the question (the observed demo behavior) prevents
flow corruption. Routing out-of-scope questions to a support number prevents dead-ends.

**Independent Test**: Send an off-topic message at each flow state and verify: (a) the
pending question is re-sent unchanged, (b) if a FAQ match exists, it is delivered first,
(c) in a terminal/no-flow state, the support redirect message is sent.

**Acceptance Scenarios**:

1. **Given** a user sends a message that does not match the expected answer during an active
   flow step, **When** no FAQ match exists, **Then** the bot re-sends the exact pending
   question without advancing the flow state.

2. **Given** a user sends an off-topic message during an active flow step, **When** the FAQ
   bank contains a relevant answer (similarity ≥ threshold), **Then** the bot delivers the
   FAQ answer, sends a transition message, then re-sends the pending question.

3. **Given** the conversation is in a terminal state (EXIT_A, EXIT_B, or `abandono`) or has
   not started, **When** the user sends any message, **Then** the bot responds with a support
   redirect: "Te invito a escribir a nuestro canal de atención en el [SUPPORT_CONTACT] para
   resolver tus dudas. Estoy aquí para ayudarte con tu inscripción cuando quieras."

---

### Edge Cases

- What happens when the external scoring API is unavailable at qualification time?
- What happens if the PATCH API call to force registration code delivery fails?
- What happens if a user responds to a re-engagement message while a timer is still active?
- What happens if a user attempts to restart the flow after being marked `abandono`?
- What happens if a user provides conflicting demographic data across multiple turns?
- What happens when a user passes Phase 1 but the quota slot disappears between scoring and
  code delivery (race condition)?

## Requirements

### Functional Requirements

- **FR-001**: The system MUST apply three sequential decision points before starting the survey:
  D1 (T&C acceptance), D2 (wants prizes), and D3 (is household shopper). Each uses inline
  keyboard buttons (Confirmo y acepto / No, gracias; Sí quiero / No, gracias; Sí / No).
- **FR-002**: A negative response to D1 or D2 MUST send the EXIT_A message verbatim and set
  `lead_status = not_qualified`. A "No" at D3 MUST send the EXIT_B message and set
  `lead_status = quota_exhausted`. All three paths end the conversation immediately.
- **FR-003**: The system MUST collect the 16 survey fields in order using the exact question
  text defined in US1. Free-text fields (full_name, state_province, municipality, neighborhood,
  email, household_size, bedrooms, shopping_categories) use LLM extraction and validation.
  Button fields (country, gender, education_psh, cars, domestic_help, shopping_frequency,
  contact_channel, contact_schedule) are captured directly from inline keyboard callbacks.
- **FR-004**: The system MUST calculate a socioeconomic score from the scoring fields
  (education_psh, cars, domestic_help, household_size, bedrooms) and validate it against
  real-time quota availability before advancing the lead to Phase 2.
- **FR-005**: The system MUST track the current survey question index in `FlowState` so that
  if a user abandons and returns, the bot resumes from the exact unanswered question without
  re-asking answered ones.
- **FR-006**: When quota slots are available and the lead is complete, the system MUST send
  platform-specific download links (iOS and Android) for the PanelSmart app.
- **FR-007**: After sending download links, the system MUST open a 10-minute monitoring window
  and set the lead status to `link_sent`.
- **FR-008**: If the user does not activate their account within 10 minutes, the system MUST
  execute a PATCH API call to an external endpoint to trigger registration code delivery
  via Telegram.
- **FR-009**: The system MUST track the registration outcome and route the lead to one of:
  Phase 4 (success), human agent handoff (technical failure), or inactivity freeze
  (no response after 20 hours).
- **FR-010**: In Phase 4, the system MUST generate an AI summary of the completed Phase 1
  survey answers and submit it to the PanelSmart platform for internal use.
- **FR-011**: Upon successful profile submission, the system MUST send the thank-you video
  and set the lead status to `ficha_hogar_completada`.
- **FR-012**: *(reserved — anti-competition filter removed; not present in verified flow)*
- **FR-013**: The system MUST store and update the lead's `lead_status` in real-time after
  every state transition.
- **FR-014**: The system MUST schedule outbound Telegram re-engagement notifications
  at the following intervals from last user activity: 75 minutes, 7 hours, and 20 hours.
- **FR-015**: The system MUST stop re-engagement notifications after 3 failed attempts and
  set the lead status to `abandono`.
- **FR-016**: When a user sends an off-topic message during an active flow, the system MUST
  first check the FAQ bank (75 entries, semantic search); if a match is found it MUST deliver
  the answer before re-sending the pending question; if no match, it MUST re-send the pending
  question directly without attempting an AI-generated answer.
- **FR-017**: After handling an off-topic message (FAQ or direct repeat), the system MUST
  re-send the exact pending question with the same button options as originally presented.
- **FR-018**: In a terminal state or when no active flow exists, the system MUST respond to
  any inbound message with the support redirect message referencing the configured support
  contact. The system MUST also redirect to this contact when a PanelSmart registration
  technical failure is detected.
- **FR-019**: If a user responds during the re-engagement cadence, the system MUST cancel
  all pending timers and resume the flow from the last pending step.

### Key Entities

- **Lead**: Represents a potential panelist. Key attributes: unique ID, `lead_status`,
  current survey question index, socioeconomic score, quota segment, re-engagement count,
  last activity timestamp.
- **SurveyProfile**: All 16 survey fields collected in Phase 1. Fields: `full_name`,
  `country`, `state_province`, `municipality`, `neighborhood`, `email`, `gender`,
  `education_psh` (Principal Sostén del Hogar education level), `cars` (0 / 1 / 2+),
  `domestic_help` (bool), `household_size` (number), `bedrooms` (number),
  `shopping_frequency`, `shopping_categories` (array of category numbers),
  `contact_channel` (WhatsApp / Llamada telefónica), `contact_schedule` (Mañana / Tarde /
  Noche). Scoring fields: education_psh, cars, domestic_help, household_size, bedrooms.
- **FlowState**: Tracks the lead's current position: decision point (D1/D2/D3) or survey
  question index (1–16); last pending question key; timestamp of last activity. Enables
  resumption after abandonment or digression.
- **ReEngagementSchedule**: Tracks outbound re-engagement notification attempts per lead.
  Fields: attempt number (1–3), scheduled time, delivery time, outcome, QStash message ID.
- **FAQEntry**: A pre-approved support question-answer pair for semantic search. 75 entries
  total, embedded at deploy time via pgvector on Vercel Postgres.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 90% of users who pass D3 complete all 16 survey questions without abandoning
  mid-survey on first attempt.
- **SC-002**: The system correctly routes 100% of leads to the appropriate `lead_status`
  with zero manual state corrections.
- **SC-003**: Re-engagement notifications recover at least 20% of leads who went inactive
  mid-survey before being marked `abandono`.
- **SC-004**: Out-of-flow messages are handled within the same conversation turn; the pending
  question is re-sent in the next message with no loss of survey position.
- **SC-005**: 100% of survey completions result in all 16 fields stored with no missing
  required values.
- **SC-006**: Zero leads are advanced to Phase 2 when quota slots are unavailable.
- **SC-007**: Support redirects are triggered only in terminal states or genuine registration
  failures — not during normal survey flow.

## Assumptions

- The survey flow (D1→D2→D3→16 questions→EXIT) is modelled on the verified PanelSmart demo
  (`asistente-demo.plataforma-ia.com`). The demo always returns EXIT_B (quota full) because
  it uses a fixed demo backend — the real system will check live quota and advance to Phase 2
  when slots are available.
- The PanelSmart app and its external registration API already exist; this system integrates
  with them but does not build them.
- Quota availability is exposed via a real-time API or Google Sheets integration that returns
  current slot counts per demographic segment. Source to be confirmed with Treinta.
- Telegram is the communication channel for this phase. WhatsApp integration is paused and
  will be re-enabled in a future phase without requiring structural changes to bot logic.
- Telegram has no session window restriction or template approval requirement; re-engagement
  messages use pre-written free-form text sent directly via the Telegram Bot API.
- The 75 FAQ entries are provided by Treinta before development begins; the system only
  performs retrieval, not FAQ authoring.
- The socioeconomic scoring algorithm (based on education_psh, cars, domestic_help,
  household_size, bedrooms) and its thresholds are defined by Treinta and provided as a
  specification input, not designed by the development team.
- Human agent handoff is handled by providing the configured support contact number/channel;
  the chatbot does not build live agent tooling.
- The anti-competition filter is NOT part of the verified flow and is removed from this spec.
- The onboarding and thank-you videos are hosted externally; the bot sends a link or embed.
- The support contact number shown in the demo (`555555555`) is a placeholder; Treinta must
  provide the real `SUPPORT_CONTACT` value before launch.
