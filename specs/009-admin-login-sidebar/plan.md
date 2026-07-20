# Implementation Plan: Admin Login + Sidebar Shell

**Branch**: `009-admin-login-sidebar` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-admin-login-sidebar/spec.md`

## Summary

Replace the browser-native Basic Auth prompt on `/admin/*` with a real login page at `/`, move the currently-public conversations pages under `/admin`, and wrap the whole admin area in a persistent, collapsible sidebar (following shadcn/ui's sidebar component) listing Conversaciones, Cuotas de reclutamiento, and Dashboard de leads. Session is a stateless HMAC-signed cookie — no new database table.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Node.js — matches existing project.

**Primary Dependencies**: Next.js 16 App Router (Server Actions for login/logout), Tailwind CSS + shadcn/ui component-copy pattern for the sidebar and login form (`@radix-ui/react-slot` and the small set of Radix primitives the shadcn `sidebar` component depends on, `class-variance-authority`, `lucide-react`, `clsx`, `tailwind-merge`). Node's built-in `crypto` for HMAC session signing — no new session/auth library.

**Storage**: N/A — no new database table (session is a signed cookie; see [data-model.md](./data-model.md)).

**Testing**: Vitest (unit tests for the sign/verify session helper), Playwright (shallow e2e: unauthenticated redirect, login success/failure, legacy `/conversations` redirect) — matches existing project conventions.

**Target Platform**: Vercel (Node.js serverless/edge functions) — same as existing app; `middleware.ts` already runs on the Edge runtime, so the session-verification code must stick to Edge-compatible APIs (Web Crypto / `node:crypto`'s subset available at the edge — confirmed during implementation, not assumed here).

**Project Type**: Web application (single Next.js project, no separate frontend/backend split).

**Performance Goals**: No specific new targets — same as existing pages (server-rendered, no added client-side data fetching beyond what each page already does).

**Constraints**: Auth check must run on every request to a protected path with negligible added latency (cookie verification is a single HMAC computation, not a DB round-trip).

**Scale/Scope**: Single shared admin credential, low request volume (internal tool) — no multi-tenancy or per-user concerns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. AI Safety & Guardrails**: Not applicable — this feature involves no LLM input/output. ✅ N/A.
- **II. Observability First**: Login attempts (success/failure) are logged as structured events, matching the project's existing `{"event": ...}` log pattern (see [research.md](./research.md) R6). ✅ Pass.
- **III. Simplicity / YAGNI**: Session mechanism is a signed cookie via `node:crypto` — zero new runtime dependency for auth itself, rejecting `next-auth`/`iron-session`/a DB session table as unjustified for a single shared credential (research.md R1). Existing CSS-Modules admin pages are left untouched rather than rewritten to Tailwind "for consistency" (research.md R2). ✅ Pass.
- **Technology Stack — Styling**: Constitution names Tailwind CSS as the approved framework; this feature is the first to actually adopt it, but that is compliance, not a deviation. ✅ Pass, no exception needed.
- **Technology Stack — new dependencies**: The shadcn sidebar's small dependency set (Radix primitives, CVA, lucide-react, clsx, tailwind-merge) has no equivalent already in the project and is standard for this exact component; evaluated and justified in research.md R2. ✅ Pass.

No violations — Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-admin-login-sidebar/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── page.tsx                          # REWRITTEN: login form (was the public landing page)
│   ├── globals.css                       # MODIFIED: add Tailwind directives + shadcn CSS variables
│   ├── admin/
│   │   ├── layout.tsx                    # NEW: sidebar shell wrapping every /admin/* page
│   │   ├── conversations/
│   │   │   ├── page.tsx                  # MOVED from src/app/conversations/page.tsx
│   │   │   ├── backfill-button.tsx       # MOVED
│   │   │   ├── conversations.module.css  # MOVED (unchanged — not migrated to Tailwind)
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # MOVED from src/app/conversations/[id]/page.tsx
│   │   │       └── monitor.tsx           # MOVED
│   │   ├── quotas/                       # UNCHANGED (already under admin)
│   │   └── dashboard/                    # UNCHANGED (already under admin)
│   └── conversations/                    # DELETED (old public location; legacy path now redirects)
├── components/
│   └── ui/
│       └── sidebar.tsx                   # NEW: shadcn sidebar component (+ its direct primitives)
├── lib/
│   ├── auth/
│   │   ├── session.ts                    # NEW: sign/verify the HMAC session cookie
│   │   └── actions.ts                    # NEW: Server Actions — login(), logout()
│   ├── utils.ts                          # NEW: cn() helper (clsx + tailwind-merge), shadcn convention
│   └── env.ts                            # MODIFIED: add ADMIN_PASSWORD, SESSION_SECRET to validated schema
├── middleware.ts                         # REWRITTEN: verify session cookie instead of Basic Auth;
│                                          #   redirect legacy /conversations* to /admin/conversations*
components.json                           # NEW: shadcn CLI config
tailwind.config.ts                        # NEW
postcss.config.mjs                        # NEW (or equivalent, per Tailwind version resolved at implementation time)

tests/
├── unit/
│   └── session.test.ts                   # NEW: sign/verify roundtrip, expiry, tamper rejection
└── e2e/
    └── admin-login.spec.ts               # NEW: unauthenticated redirect, login success/failure, legacy redirect
```

**Structure Decision**: Single Next.js project, no new top-level project. The sidebar shell is a nested App Router layout (`src/app/admin/layout.tsx`) — the framework-native way to share UI across a route subtree, applying automatically to the existing `quotas`/`dashboard` pages and the relocated `conversations` pages alike with no per-page wiring.

## Complexity Tracking

*No violations — table intentionally empty.*
