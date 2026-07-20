# Feature Specification: Admin Login + Sidebar Shell

**Feature Branch**: `009-admin-login-sidebar`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "la page / raiz deberia ser un login, el resto de paginas deben estar dentro del admin. El admin deberia implementar sidebar de https://ui.shadcn.com/docs/components/base/sidebar"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Login gate protects every internal page (Priority: P1)

An unauthenticated visitor who opens the app's root URL sees a login form instead of any product content. Only after entering the correct admin credential do they gain access to leads, conversations, quotas, or dashboard data. Anyone who tries to reach an internal page directly without logging in is sent to the login form instead of seeing the page.

**Why this priority**: Today the conversations monitor is publicly reachable with no authentication at all (it contains names, phone numbers, emails, and full conversation transcripts), while quotas/dashboard sit behind a browser-native Basic Auth prompt. This story closes that gap and unifies access behind one real login screen — it's the security-critical piece the rest of the feature depends on.

**Independent Test**: With no session, request every internal page's URL directly — each one must redirect to the login form and must not render any of its data. Submitting the correct credential on the login form must grant access; submitting an incorrect one must not.

**Acceptance Scenarios**:

1. **Given** a visitor with no active session, **When** they open the root URL, **Then** they see a login form and no other content.
2. **Given** a visitor with no active session, **When** they request any internal page's URL directly, **Then** they are redirected to the login form and the page's data is not returned.
3. **Given** a visitor on the login form, **When** they submit the correct admin credential, **Then** they are granted access and land on the admin area.
4. **Given** a visitor on the login form, **When** they submit an incorrect credential, **Then** they see an error message, remain on the login form, and gain no access.
5. **Given** a logged-in admin, **When** they open the root URL again, **Then** they are taken into the admin area rather than being shown the login form a second time.

---

### User Story 2 - Persistent sidebar navigation across admin sections (Priority: P1)

Once logged in, an admin sees a sidebar, present on every internal page, listing all available sections (Conversaciones, Cuotas, Dashboard). Clicking any item takes them straight to that section without needing to know or type a URL. The sidebar always shows which section is currently open.

**Why this priority**: Today there is no shared navigation at all — `/admin/quotas` and `/admin/dashboard` each hand-roll their own one-off "back to home" links, and the conversations pages have none. Without a consistent nav shell, "put everything inside admin" (User Story 3) would just produce more disconnected pages. This is core to the feature being usable, not an enhancement on top of it.

**Independent Test**: From any one admin section, confirm the sidebar lists every other section and that selecting one navigates there and updates which item is highlighted as active — independent of what each section's own page displays.

**Acceptance Scenarios**:

1. **Given** an admin viewing any internal page, **When** the page loads, **Then** a sidebar listing all admin sections is visible.
2. **Given** an admin viewing one section, **When** they click a different section in the sidebar, **Then** they are taken to that section and it is now highlighted as the active item.
3. **Given** an admin on a small/narrow screen, **When** they view an internal page, **Then** the sidebar can be collapsed or hidden without losing access to its navigation items (matching the collapsible behavior of the referenced shadcn sidebar component).

---

### User Story 3 - Conversations monitor moves inside the protected admin area (Priority: P2)

The existing conversations list and individual conversation monitor, which today live at public, unauthenticated URLs, move to live inside the admin area alongside Cuotas and Dashboard, gated by the same login as everything else.

**Why this priority**: This is the concrete "move the rest of the pages into admin" instruction. It depends on Story 1 (the gate must exist) and benefits from Story 2 (the sidebar must list it), but the relocation itself is a distinct, separately verifiable change to where this content lives.

**Independent Test**: Confirm the conversations list and an individual conversation's monitor render correctly (same information as before) when reached through the admin area, and confirm their old public locations no longer serve that data to a logged-out visitor.

**Acceptance Scenarios**:

1. **Given** a logged-in admin, **When** they select "Conversaciones" from the sidebar, **Then** they see the same conversation list they see today, unchanged in content.
2. **Given** a logged-in admin viewing the conversations list, **When** they open one conversation, **Then** they see the same live conversation monitor they see today, unchanged in content.
3. **Given** a logged-out visitor, **When** they request the old public conversations URL, **Then** they do not see any conversation data.

---

### User Story 4 - Admin can log out (Priority: P3)

A logged-in admin can end their session from the sidebar at any time, after which they must log in again to regain access.

**Why this priority**: Necessary for a complete, self-contained login system (shared devices, end of a work session), but the feature is usable and secure without it on day one, so it's the lowest priority of the four.

**Independent Test**: From any admin page, trigger logout and confirm the session no longer grants access to any internal page.

**Acceptance Scenarios**:

1. **Given** a logged-in admin, **When** they choose "Cerrar sesión" from the sidebar, **Then** their session ends and they are returned to the login form.
2. **Given** a session that has just been logged out, **When** the browser is used to request any internal page again, **Then** the visitor is redirected to the login form.

---

### Edge Cases

- What happens when a session expires while the admin is mid-task on a page? They should be sent to the login form; after logging in again they should not have to re-discover which section they were on.
- What happens when someone requests an old bookmarked URL for a page that has moved under admin (e.g. the previous conversations link)? It should lead them to the correct new location rather than a dead page.
- What happens when the admin credential is not configured at all in the environment? No login attempt should succeed (fail closed — same posture as today's Basic Auth when unconfigured).
- What happens if someone submits the login form repeatedly with wrong credentials? Each attempt gets the same generic error; no account lockout or credential-strength feedback is required for this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The root URL MUST show a login form to any visitor without an active admin session, and MUST NOT show any other product content there.
- **FR-002**: The system MUST require a valid, active admin session before serving any internal page (conversations list, conversation detail, cuotas, dashboard) or the data behind it.
- **FR-003**: A visitor without an active session who requests any internal page directly MUST be redirected to the login form instead of receiving that page's content.
- **FR-004**: The login form MUST authenticate against the same single admin credential the system already uses today, so existing admins can use the password they already have without any migration step.
- **FR-005**: On successful login, the system MUST establish a session that keeps the admin authenticated across subsequent page visits, without re-prompting for credentials on every request, until the admin logs out or the session expires.
- **FR-006**: The system MUST provide a visible way to log out from within the admin area, which ends the session immediately.
- **FR-007**: On an incorrect login attempt, the system MUST show a clear error message and MUST NOT grant any access.
- **FR-008**: An admin who already has an active session and opens the root URL MUST be taken into the admin area rather than shown the login form again.
- **FR-009**: Every internal page MUST display a persistent sidebar listing all available admin sections: Conversaciones, Cuotas de reclutamiento, and Dashboard de leads.
- **FR-010**: The sidebar MUST visually indicate which section the admin currently has open.
- **FR-011**: Selecting a section in the sidebar MUST navigate the admin to that section from anywhere in the admin area, in a single action.
- **FR-012**: The sidebar's navigation and collapse behavior MUST follow the pattern of the referenced shadcn sidebar component (https://ui.shadcn.com/docs/components/base/sidebar) — collapsible, with the section list always reachable.
- **FR-013**: The conversations list and individual conversation monitor MUST be reachable from inside the admin area (via the sidebar) and MUST show the same information they show today.
- **FR-014**: The conversations list and individual conversation monitor MUST NOT be reachable by an unauthenticated visitor at their previous public URLs.
- **FR-015**: A request to a previous public page URL that has moved under admin MUST lead the visitor toward the correct new location (rather than silently returning nothing or a broken page).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0% of conversation, quota, or dashboard data is servable to a visitor without a valid session, at any URL.
- **SC-002**: An admin can reach any of the three admin sections from any other section in a single click.
- **SC-003**: 100% of existing admins can log in using the credential they already have today, with no re-registration or migration step.
- **SC-004**: The currently active admin section is visually identifiable from the sidebar within 1 second of a page finishing load.
- **SC-005**: Conversations list and detail content shown inside the admin area is identical to what is shown today — no information is lost or altered by the relocation.

## Assumptions

- The single shared admin credential in use today (the existing admin password) remains the login credential; this feature does not introduce multiple named accounts, roles, or permission levels.
- The current browser-native Basic Auth prompt guarding `/admin/*` is replaced by the new login form and session — the app should not end up with two parallel, overlapping authentication mechanisms for the same area.
- Existing `/api/admin/*` data endpoints are unaffected by this feature beyond continuing to require the same authenticated access they require today; this feature is about pages and navigation, not the underlying APIs.
- After logging in, an admin lands on a sensible default admin section rather than a blank page.
- No account lockout, rate limiting, or password-strength requirements are introduced — the risk posture for repeated failed attempts is unchanged from today's Basic Auth behavior.
- The sidebar's visual design (colors, spacing, iconography) should feel consistent with the admin pages that already exist, while its navigational structure and collapse behavior follow the referenced shadcn sidebar component.
