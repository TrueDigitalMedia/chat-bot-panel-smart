# Tasks: Admin Login + Sidebar Shell

**Input**: Design documents from `/specs/009-admin-login-sidebar/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Included, matching the project's established pattern (unit test for pure logic, e2e smoke test for the flow) — see plan.md's Testing section.

> **⚠️ Deploy-coupling warning**: T004–T009 (US1) MUST ship together, atomically. T009 removes the Basic Auth check from `middleware.ts` — if it ships without T004–T008 already in place, `/admin/*` becomes either fully inaccessible (no working auth) or fully open (broken check), not a safe intermediate state. US2 and US3 do **not** share this constraint — each is independently deployable before, after, or interleaved with US1 (see Dependencies below).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [X] T001 Confirm Next.js 16 supports Tailwind CSS v4 via `@tailwindcss/postcss`, and that npm is the project's package manager (existing `package-lock.json`). No file changes. **Confirmed** — both true.

**Checkpoint**: Ready to install Tailwind.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Styling foundation shared by US1 (login form) and US2 (sidebar) — blocks both.

**⚠️ CRITICAL**: No US1 or US2 work can begin until this phase is complete. US3 does not depend on this phase.

- [X] T002 Install and configure Tailwind CSS: add `tailwindcss` + `@tailwindcss/postcss` to `package.json`; create `postcss.config.mjs`; add the Tailwind import and shadcn CSS theme variables to `src/app/globals.css`. **Result**: done via `npx shadcn@latest init -p nova -b base -t next` (base primitives, per the user-referenced shadcn URL using `/components/base/...`), which regenerated `globals.css` with its own `:root`/`.dark` theme variables (oklch-based) instead of the prior `--background`/`--foreground` + `prefers-color-scheme` pair — a deliberate scope call, not an oversight: existing CSS-Modules pages define their own local custom properties per page and don't read the root variables, so this is a no-op for them visually.
- [X] T003 [P] Initialize shadcn/ui: create `components.json`; create `src/lib/utils.ts` with the `cn()` helper (`clsx` + `tailwind-merge`); add `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react` to `package.json`. **Result**: done by the same init command; also added `button.tsx`, and later `input.tsx`/`card.tsx`/`label.tsx`/`separator.tsx`/`field.tsx` for the login form (T008).

**Checkpoint**: `npm run build` succeeds with Tailwind wired in; zero visual change to any existing page (nothing consumes Tailwind classes yet).

---

## Phase 3: User Story 1 - Login gate protects every internal page (Priority: P1) 🎯 MVP

**Goal**: `/` shows a login form to anyone without a valid session; every admin page and admin API route requires that session.

**Independent Test**: With no session cookie, request every internal page's URL directly — each redirects to `/` without returning its data. Submitting the correct `ADMIN_PASSWORD` grants access; an incorrect one does not.

### Tests for User Story 1

- [X] T004 [P] [US1] Unit test `tests/unit/session.test.ts`: sign/verify roundtrip succeeds; an expired token is rejected; a tampered signature is rejected. Write first — must fail until T005 exists. **Result**: 7 tests, confirmed failing (module not found) before T005, all passing after.

### Implementation for User Story 1

- [X] T005 [US1] Implement `src/lib/auth/session.ts`: `createSessionCookie()` / `verifySessionCookie()`, HMAC-SHA256 over an expiry timestamp keyed by `SESSION_SECRET` (research.md R1). **Result**: implemented with Web Crypto (`crypto.subtle`) directly rather than `node:crypto` — works identically in `middleware.ts` (Edge) and Server Actions (Node) with zero runtime branching, so the originally-planned fallback logic wasn't needed. `btoa`/`atob` used for base64url (both Edge- and Node-global), not `Buffer`.
- [X] T006 [US1] Add `ADMIN_PASSWORD` and `SESSION_SECRET` to `src/lib/env.ts`'s validated zod schema; update `.env.example`. **Result**: added as optional strings (matching the existing WhatsApp-credentials pattern in the same schema — fail-closed if unset, doesn't crash the app). Note: `middleware.ts` (T009) deliberately still reads `process.env.SESSION_SECRET` directly rather than importing `env.ts` — that module's eager `validateEnv()` requires Telegram/QStash/OpenAI vars too, and the original Basic Auth code avoided that exact coupling on purpose; Server Actions (Node runtime, already import `env.ts` throughout the codebase) use the validated `env.ADMIN_PASSWORD`/`env.SESSION_SECRET`.
- [X] T007 [US1] Implement `src/lib/auth/actions.ts` — `login(prevState, formData)` Server Action: compare the submitted password to `env.ADMIN_PASSWORD`; on success, set the cookie from `createSessionCookie()` and redirect to `/admin/dashboard`; on failure, return a form error state (FR-007). Log a structured `{"event": "admin_login_attempt", "success": boolean}` on each attempt — never log the submitted password (research.md R6).
- [X] T008 [US1] Rewrite `src/app/page.tsx` as the login form, replacing all current landing content (FR-001). **Result**: split into a Server Component (`page.tsx`, checks the session cookie and redirects if already valid — FR-008) + a Client Component (`login-form.tsx`, `useActionState` + shadcn `Card`/`Field`/`Input`/`Button`) since the Server Action's pending/error state needs client-side rendering. Also deleted `src/app/page.module.css`, which was already dead code before this change (the old `page.tsx` imported `conversations.module.css`, never its own module).
- [X] T009 [US1] Rewrite `src/middleware.ts`: remove the Basic Auth check entirely; verify the session cookie via `verifySessionCookie()` for the `/admin/:path*` and `/api/admin/:path*` matchers; redirect to `/` when the cookie is missing, invalid, or expired (FR-002, FR-003). **Result**: `/api/*` paths return a bare 401 instead of redirecting (a redirect makes no sense for a fetch-based API caller); page paths redirect to `/`.
- [X] T010 [P] [US1] E2e smoke test `tests/e2e/admin-login.spec.ts`: unauthenticated request to `/admin/dashboard` redirects to `/`; submitting the wrong password shows an error; submitting the right one grants access; legacy `/conversations` redirect check (tolerant of running before or after T016). Written but **not run** against a live dev server without explicit go-ahead (this project's established pattern — see quickstart.md).

**Checkpoint**: Login gate fully functional and independently testable. `/admin/quotas` and `/admin/dashboard` — today's only two admin pages — are now protected by the new login instead of Basic Auth.

---

## Phase 4: User Story 2 - Persistent sidebar navigation (Priority: P1)

**Goal**: Every internal page shows a collapsible sidebar listing Conversaciones / Cuotas de reclutamiento / Dashboard de leads, with the active section highlighted.

**Independent Test**: From any one admin page, confirm the sidebar lists every section and that clicking one navigates there and updates the highlighted item — independent of which auth mechanism currently gates the page.

### Implementation for User Story 2

- [X] T011 [US2] Add the shadcn `sidebar` component and its direct primitives to `src/components/ui/` (`sidebar.tsx` plus whichever of `button.tsx` / `sheet.tsx` / `tooltip.tsx` / `separator.tsx` / `input.tsx` / `skeleton.tsx` it depends on — resolved via the shadcn CLI/skill at implementation time). **Result**: `npx shadcn@latest add sidebar` — added `sidebar.tsx`, `sheet.tsx`, `tooltip.tsx`, `skeleton.tsx`, `hooks/use-mobile.ts`.
- [X] T012 [US2] Create `src/app/admin/layout.tsx`: wrap `children` in the shadcn `SidebarProvider`/`Sidebar`, with a static 3-item nav list (Conversaciones → `/admin/conversations`, Cuotas de reclutamiento → `/admin/quotas`, Dashboard de leads → `/admin/dashboard`), each with a `lucide-react` icon; highlight the item matching the current pathname (FR-009, FR-010, FR-011, FR-012). **Result**: split into `layout.tsx` (Server Component, wraps `TooltipProvider`/`SidebarProvider`/`SidebarInset`) + `admin-sidebar.tsx` (Client Component, `usePathname()` for active-item highlighting, `SidebarMenuButton render={<Link .../>}` per the base-UI `render` prop convention).
- [X] T013 [US2] Verify `/admin/quotas` and `/admin/dashboard` render correctly nested inside the new layout (their existing CSS-Modules styling untouched — research.md R2); remove their now-redundant one-off "Inicio" back-links if they visually duplicate the sidebar. **Result**: verified live via dev server + browser — both pages render correctly nested, collapse/expand works, active-item highlighting switches correctly on navigation. Removed the "Dashboard"/"Inicio"/"Cuotas"/"Inicio" one-off links from both pages' headers (now redundant with the sidebar) and their now-unused `Link` imports.

**Checkpoint**: Sidebar renders on both existing admin pages, navigates correctly, and collapses on narrow screens — independently of whichever auth mechanism (Basic Auth or the new login) currently gates them.

---

## Phase 5: User Story 3 - Conversations move inside admin (Priority: P2)

**Goal**: The conversations list and detail monitor live under `/admin`, gated the same as everything else; their old public URLs redirect instead of serving data.

**Independent Test**: Reached through the admin area, the conversations list and an individual conversation's monitor show the same information as today; the old public URLs no longer serve that data to a logged-out visitor.

### Implementation for User Story 3

- [X] T014 [US3] Move `src/app/conversations/page.tsx`, `backfill-button.tsx`, `conversations.module.css` → `src/app/admin/conversations/` (update the CSS-module relative import in `page.tsx` if the move changes its relative path; content otherwise unchanged). **Result**: moved via `git mv`; relative imports unchanged (directory structure preserved). Updated the "Abrir" link to `/admin/conversations/${c.id}` and removed the now-redundant "Inicio" header link.
- [X] T015 [US3] Move `src/app/conversations/[id]/page.tsx`, `monitor.tsx` → `src/app/admin/conversations/[id]/` (same relative-import note as T014). **Result**: moved via `git mv`; updated the "← Todas" back-link to `/admin/conversations`.
- [X] T016 [US3] Add legacy-path redirects in `src/middleware.ts`: `/conversations` → `/admin/conversations`, `/conversations/:id` → `/admin/conversations/:id` (FR-015; research.md R3 — one rule, not duplicated per page). **Result + scope correction found during implementation**: also discovered `/api/conversations/*` (list/detail/eval) and `/api/evals/backfill` — the actual data endpoints the conversations pages call — were **not** covered by the original middleware matcher (only `/admin/:path*` and `/api/admin/:path*` were), so moving just the page shell would NOT have satisfied FR-002/FR-014/SC-001 (data would still be fetchable unauthenticated at those API routes). Extended the matcher to also cover `/api/conversations/:path*` and `/api/evals/:path*`. Verified via `curl`: both return 401 with no session cookie.
- [X] T017 [US3] Delete the now-empty `src/app/conversations/` directory. **Result**: removed (both it and its `[id]/` subdirectory were empty after the moves).

**Checkpoint**: `/admin/conversations` shows the same list/detail as before the move; the old public URLs redirect and serve no data to an unauthenticated visitor.

---

## Phase 6: User Story 4 - Admin can log out (Priority: P3)

**Goal**: A logged-in admin can end their session from the sidebar.

**Independent Test**: From any admin page, trigger logout and confirm the session no longer grants access to any internal page.

**Depends on**: User Story 1 (needs `session.ts` and the cookie mechanism to exist).

### Implementation for User Story 4

- [X] T018 [US4] Implement `logout()` Server Action in `src/lib/auth/actions.ts`: clear the session cookie, redirect to `/`.
- [X] T019 [US4] Add a "Cerrar sesión" control to the sidebar footer in `src/app/admin/layout.tsx` (or a small client component it renders), wired to the `logout` Server Action. **Result**: added to `admin-sidebar.tsx`'s `SidebarFooter` as a `<form action={logout}>` wrapping a `SidebarMenuButton type="submit"`. Verified live: clicking it returns to the login form, and a subsequent unauthenticated request to `/admin/dashboard` correctly redirects to `/` again.

**Checkpoint**: Logging out ends the session; subsequent requests to any admin path redirect to `/`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T020 [P] Run `npx vitest run tests/unit` — confirm `session.test.ts` passes and zero regressions in the existing suite. **Result**: 115/115 passing (108 pre-existing + 7 new session tests).
- [X] T021 [P] Run `npx tsc --noEmit` — confirm no new type errors (the pre-existing, unrelated `persist-eval.ts` error is expected to remain). **Result**: only that one pre-existing error remains.
- [X] T022 Execute [quickstart.md](./quickstart.md) end-to-end against a local dev server. **Result**: ran live via a real dev server + the in-app browser tool (with real Neon DB data) — all 4 sections verified: (1) login gate — unauthenticated redirect to `/`, wrong password shows "Contraseña incorrecta." and stays on `/`, correct password redirects to `/admin/dashboard`, already-authenticated visit to `/` skips straight to the admin area; (2) sidebar — all 3 sections listed, active-item highlighting switches correctly on navigation, collapse/expand works (including header text hiding in icon-only mode); (3) conversations under admin — list and detail render identically to before, old `/conversations` URL 308-redirects, `/api/conversations/*` and `/api/evals/backfill` return 401 without a session (see T016's scope correction); (4) logout — ends the session, subsequent requests redirect to `/` again. Also ran `npx playwright test tests/e2e/admin-login.spec.ts`: the `request`-only test (legacy redirect) passed; the 3 browser-based tests failed with "Executable doesn't exist" — Playwright's Chromium binary isn't installed in this environment (pre-existing environment gap, unrelated to this feature); the manual browser-tool run above covers the same scenarios.
- [X] T023 Update `docs/WIKI.md` (§4 flujo, §11 estado de implementación) to reflect the new login gate, relocated conversations pages, and sidebar shell — mark spec 009 as implemented, matching the pattern used for specs 004-008.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — blocks US1 and US2 only (US3 does not need Tailwind/shadcn).
- **US1 (Phase 3)**: Depends on Foundational. No dependency on US2 or US3.
- **US2 (Phase 4)**: Depends on Foundational. No dependency on US1 or US3 — the sidebar wraps whatever admin pages exist today regardless of which auth mechanism gates them.
- **US3 (Phase 5)**: No dependency on Foundational, US1, or US2 — `/admin/:path*` is already gated (by Basic Auth pre-US1, or by the new login post-US1) either way. Implemented after US1/US2 here purely for narrative convenience (all three touch adjacent areas), not because of a hard technical dependency.
- **US4 (Phase 6)**: Depends on US1 (needs `src/lib/auth/session.ts` and the cookie it defines).
- **Polish (Phase 7)**: Depends on all four stories being complete.

### Parallel Opportunities

- T002 and T003 (Foundational) touch different files and can run in parallel.
- Once Foundational is done, US1 and US2 can be implemented in parallel by different people (T004–T010 vs. T011–T013) — they touch disjoint files except both eventually render inside `src/app/admin/layout.tsx` vs. `src/app/page.tsx`, which don't overlap.
- US3 (T014–T017) can be implemented at any point in parallel with US1/US2, since it doesn't depend on either.
- T020 and T021 (Polish) can run in parallel.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational).
2. Phase 3 (US1) — ship T004–T009 **together** (deploy-coupling warning above). This alone closes the security gap that motivated the feature (public conversations page, Basic Auth popup).
3. **STOP and VALIDATE**: run quickstart.md §1 against a local dev server (with go-ahead).

### Incremental Delivery

1. Setup + Foundational.
2. US1 → login gate live, Basic Auth retired. Deploy.
3. US2 → sidebar appears on existing admin pages. Deploy.
4. US3 → conversations relocated, old URL redirects. Deploy.
5. US4 → logout available. Deploy.

Each step after US1 adds value without breaking what shipped before it.
