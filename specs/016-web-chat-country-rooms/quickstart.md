# Quickstart: Validating Web Chat Country Rooms

Prerequisites: `npm install`; `.env` with `POSTGRES_URL` (dev branch) and ideally `APP_BASE_URL`;
**features 014 + 015 merged**; migration `0030` applied.

## 1. Migration

```bash
npm run db:migrate        # applies 0030_web_chat_rooms.sql
npm run db:generate       # drizzle-kit: no new migration => schema.ts matches DB (leads.acquisition_source present)
```

## 2. Unit tests

```bash
npx vitest run tests/unit/chat-rooms.test.ts                 # registry: slug↔country, roomUrl, listRooms
npx vitest run tests/unit/survey-preanswered-skip.test.ts    # generalized skip; CAM no-op
```

## 3. Room happy path (E2E + manual)

```bash
npm run dev
npx playwright test tests/e2e/chat-country-room.spec.ts
```

Manual check:
1. Open `http://localhost:4000/chat/ecuador` in a **fresh** browser profile.
2. Accept the consent gate, answer the name question.
3. **The "¿En qué país te encuentras?" question never appears.** The next question is the first
   Ecuador geo question ("¿En qué provincia vives?").
4. In the DB: `survey_profiles.country = 'Ecuador'`, `leads.acquisition_source = 'web:room:Ecuador'`,
   `leads.channel = 'web'`.
5. Repeat with `/chat/mexico` → country `México`, `acquisition_source = 'web:room:México'`, Mexico geo
   wording ("estado / municipio o alcaldía").

## 4. Generic `/chat` unchanged (FR-012 / SC-005)

1. Open `http://localhost:4000/chat` (bare) in a fresh profile → the country question **is** shown,
   with all supported countries incl. Ecuador and México.
2. `leads.acquisition_source` is `null`.

## 5. No re-scope of an existing conversation (FR-005 / SC-003)

1. In the fresh profile from step 4, answer country = **Guatemala**, answer a couple more questions.
2. Now navigate to `http://localhost:4000/chat/mexico` in the **same** browser.
3. The conversation resumes as **Guatemala** — transcript intact, no opening message re-sent, country
   unchanged. Logs show `web_room_entry { outcome: 'existing_lead_ignored' }`.

## 6. Unknown / CAM slug degrades (FR-007)

1. Open `http://localhost:4000/chat/guatemala` or `/chat/ecuadorr` in a fresh profile.
2. Page renders the normal chat (no 404). The country question **is** asked.
3. Logs show `web_room_entry { outcome: 'degraded', slug: 'guatemala' }`.

## 6b. Room lead corrects country (US2 scenario 4)

1. Fresh profile on `/chat/ecuador`; pass consent; answer name; the country question is skipped.
2. At the next question, ask to change your country (e.g. "me equivoqué, vivo en Guatemala").
3. The correction flow updates `survey_profiles.country` to `Guatemala`; the flow continues with
   Guatemala content. `leads.acquisition_source` is still `web:room:Ecuador`.

## 7. Admin rooms page + attribution (FR-009 / SC-004 / SC-006)

```bash
# visit /admin/rooms
```
- Lists Ecuador and México with their full `/chat/<slug>` URLs and a copy button.
- Copying a link and opening it lands on the right room.
- In `/admin/leads`, a lead created from `/chat/ecuador` shows / can be filtered by
  `acquisition_source = web:room:Ecuador`.

## 8. Regression (SC-005)

```bash
npm run test:regression      # existing CAM golden-master (Telegram) — proves the survey-plan.ts change is a no-op
npx vitest run               # full unit suite (incl. survey-preanswered-skip no-op tests)
npx playwright test tests/e2e # incl. bare-/chat "still asks country" (chat-country-room.spec.ts)
```

Expected: zero snapshot diffs in the CAM golden-master; Telegram / WhatsApp / generic-`/chat` flows
unchanged. (No new `tests/regression/` journey is added — the bare-`/chat` check is the E2E.)

## 9. Observability

```bash
grep '"web_room_entry"' dev.log | jq
```
Expected outcomes seen: `applied`, `existing_lead_ignored`, `degraded`.
