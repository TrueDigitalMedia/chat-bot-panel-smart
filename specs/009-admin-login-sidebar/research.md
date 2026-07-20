# Research: Admin Login + Sidebar Shell

## R1: Session mechanism

**Decision**: Stateless, HMAC-signed session cookie (Node's built-in `crypto`, `createHmac('sha256', ...)`) — no session table, no new runtime dependency.

**Rationale**: There is exactly one credential (`ADMIN_PASSWORD`) and no per-user data. A signed cookie encoding an expiry timestamp, verified on every request in `middleware.ts`, gives real tamper-resistance without persisting anything. Matches the constitution's Simplicity/YAGNI principle ("new dependencies MUST be evaluated against existing capabilities first") — `node:crypto` already covers this.

**Alternatives considered**:
- `next-auth` — built for multi-provider/multi-user auth with a provider registry; this app has one shared password and no user table. Adopting it would mean configuring and maintaining machinery for a problem that doesn't exist here.
- `iron-session` — a good library, but it's a new dependency solving exactly what `node:crypto`'s HMAC already solves for this single-secret case.
- DB-backed session table — would need a new migration and a query on every request for no benefit over a signed cookie with an expiry baked in; rejected as unjustified complexity.

**New env var**: `SESSION_SECRET` (separate from `ADMIN_PASSWORD`) as the HMAC signing key. Reusing `ADMIN_PASSWORD` itself as the cryptographic key would mix "the credential being checked" with "the key that signs the proof of having checked it" — a small, standard hygiene issue worth one extra env var, given the pages behind this gate carry lead PII (names, emails, phone numbers). Both get added to `src/lib/env.ts`'s validated schema (today `ADMIN_PASSWORD` is read raw via `process.env.ADMIN_PASSWORD` in `middleware.ts`, bypassing validation — this feature folds it into the same validated pattern as the rest of the app's config).

## R2: Styling foundation for the sidebar

**Decision**: Introduce Tailwind CSS + the shadcn/ui component-copy pattern (starting with `sidebar`, plus its direct primitives), scoped to the new login page and the new admin shell. Existing CSS-Modules pages under `/admin` (`quotas`, `dashboard`) and their components are left untouched — the sidebar wraps them via a shared layout without requiring changes to their internal markup or styles.

**Rationale**: The project constitution already names **Tailwind CSS** as the approved styling framework ("no additional CSS frameworks without explicit approval") — the existing CSS-Modules pages predate that constitution and are simply grandfathered in, not a conflicting standard. shadcn/ui's sidebar is not a hosted npm runtime dependency; its component source is copied into `src/components/ui/`, keeping the footprint auditable. The user's request named this exact component as the pattern to follow.

**Alternatives considered**:
- Hand-rolled CSS-Modules sidebar (matching the rest of the admin pages' existing style) — rejected because the user explicitly asked for the shadcn sidebar's behavior (collapsible, keyboard shortcut, responsive-to-sheet-on-mobile), which is nontrivial to reproduce by hand and is exactly what the referenced component already provides.
- Migrating all existing admin pages to Tailwind in the same feature — rejected as unjustified scope expansion (YAGNI); those pages work today and this feature's job is the login gate + navigation shell, not a styling rewrite.

## R3: Relocating the conversations pages

**Decision**: Physically move `src/app/conversations/**` to `src/app/admin/conversations/**` (Next.js file-system routing). The old `/conversations` and `/conversations/[id]` paths become thin redirects to their `/admin/...` equivalents (implemented once, in `middleware.ts`, alongside the auth check — not duplicated per page).

**Rationale**: Simplest mechanism satisfying FR-013/FR-014/FR-015 with no duplicated logic. `middleware.ts` already inspects every request path for the auth gate, so adding a redirect rule for the two legacy paths in the same pass is a small addition, not a second mechanism.

## R4: Auth gate scope

**Decision**: `middleware.ts`'s matcher expands from `/admin/:path*` + `/api/admin/:path*` to also cover the relocated `/admin/conversations/:path*` (already covered by `/admin/:path*`), the legacy `/conversations` paths (for the redirect), **and `/api/conversations/:path*` + `/api/evals/:path*`** — the actual data endpoints the conversations pages call client-side. This last part was not obvious at planning time and was found during implementation: relocating only the page shell under `/admin` would have left the underlying data fetchable unauthenticated at its original API routes, since those were never under `/api/admin/`. The root `/` route is explicitly excluded from the gate (it must render the login form itself, not redirect to itself) but is handled specially: if a valid session cookie is already present, `/` redirects into the admin area (FR-008) instead of showing the form again.

**Rationale**: One middleware, one place that defines "what's protected," matching how auth already works today — this feature changes *how* the check is performed (signed cookie vs. Basic Auth header), not *where* it runs.

## R5: Login/logout wiring

**Decision**: Next.js Server Actions — one for login (validates the submitted password against `ADMIN_PASSWORD`, sets the signed cookie on success) and one for logout (clears the cookie) — invoked directly from the login form and the sidebar's logout control, respectively.

**Rationale**: Server Actions are the framework-native mechanism for form submissions that mutate server state in the App Router (already implicitly the project's paradigm — pages are server components; `admin/dashboard`'s `filters-form.tsx` and `admin/quotas`'s `quota-row-form.tsx` are the closest existing precedent for client-interactive forms in this codebase). Avoids standing up a parallel `/api/auth/*` REST surface for something a form action already does directly.

## R6: Observability

**Decision**: Log login attempts (success and failure, without logging the submitted password) as structured console events, following the existing `{"event": "...", ...}` pattern already used for lead status transitions (`src/lib/state-machine/index.ts`).

**Rationale**: Constitution Principle II (Observability First) — an access-control gate protecting PII-bearing pages is exactly the kind of thing that should leave an audit trail, even though it's not an LLM call in the sense the principle was originally written for.
