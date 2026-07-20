# Data Model: Admin Login + Sidebar Shell

This feature introduces no new database tables or migrations (see [research.md](./research.md) R1). Its "data" is two lightweight, non-persisted concepts:

## AdminSession (conceptual — not a DB row)

Represented entirely as a signed cookie value; nothing is stored server-side.

| Field | Type | Notes |
|---|---|---|
| `expiresAt` | timestamp (embedded in cookie payload) | Session validity cutoff; checked on every request in `middleware.ts`. |
| `signature` | HMAC-SHA256 digest (embedded in cookie payload) | Computed over `expiresAt` using `SESSION_SECRET`; a request is authenticated only if the signature verifies and `expiresAt` is in the future. |

No `id`, no user reference — there is exactly one credential (`ADMIN_PASSWORD`) for the whole app, so "who" is authenticated is not a distinguishable field, only "is there a currently-valid session."

## Sidebar navigation item (UI concept — static list, not data)

| Field | Type | Notes |
|---|---|---|
| `label` | string | Display text, e.g. "Conversaciones". |
| `href` | string | Route, e.g. `/admin/conversations`. |
| `icon` | icon reference | From the icon set shadcn's sidebar examples use (`lucide-react`). |

Fixed list of 3 items (Conversaciones, Cuotas de reclutamiento, Dashboard de leads) — not sourced from the database, defined once alongside the sidebar shell.

## Existing entities touched (unchanged in shape)

- **`leads`**, **`survey_profiles`**, **`conversation_messages`**, **`quota_targets`**, etc. — none of these change. This feature only changes *where* their existing read paths (conversations list/detail, quotas panel, dashboard) live in the URL tree and *what* gates access to them.
