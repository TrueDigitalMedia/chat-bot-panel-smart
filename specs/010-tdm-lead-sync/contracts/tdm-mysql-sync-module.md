# Contract: `src/lib/tdm-mysql/` module API (internal)

This is the interface the rest of the codebase (the four call sites in
[plan.md](../plan.md) §Project Structure) is allowed to depend on. Everything not listed
here (pool internals, row-builder internals) is a private implementation detail of the
module.

## `client.ts`

```ts
export function isClientMysqlConfigured(): boolean
export function isClientMysqlSyncEnabled(): boolean
export function getClientMysqlPool(): mysql.Pool // mysql2/promise
```

- `isClientMysqlConfigured()` — `true` iff host/user/password/database are all set.
- `isClientMysqlSyncEnabled()` — `env.CLIENT_MYSQL_SYNC_ENABLED && isClientMysqlConfigured()`.
- `getClientMysqlPool()` — lazy singleton; first call constructs the pool (see
  research.md R2 for pool config), later calls return the same instance. Callers in
  `sync.ts` are the only intended consumers.

## `sync.ts` — the only functions the four call sites invoke

```ts
export async function syncLeadPhase1Complete(
  leadId: string,
  correlationId: string,
): Promise<boolean>

export async function syncLeadFichaHogarComplete(
  leadId: string,
  correlationId: string,
  summary: string | null,
): Promise<boolean>

export async function syncLeadFichaHogarDiscarded(
  leadId: string,
  correlationId: string,
): Promise<boolean>
```

**Guarantees every caller can rely on**:

1. **Never throws.** Every internal error (config, network, MySQL error, Postgres
   write-back error) is caught inside the function. Callers do not need try/catch.
2. **Returns `false` on any failure**, `true` on success *or* on a clean no-op (sync
   disabled/unconfigured). Callers MAY inspect the return value for their own logging
   but MUST NOT branch user-facing behavior on it (per spec FR-007 — a `false` here must
   never change what the user sees).
3. **No-ops immediately** (before any I/O) when `!isClientMysqlSyncEnabled()`.
4. **Idempotent** per the rules in [data-model.md](../data-model.md) §4 — safe to call
   again after a prior success (Phase 1) without creating a duplicate row.
5. **Logs every attempt** via `logCall()` with `callType` one of
   `'tdm_mysql_sync_phase1'` | `'tdm_mysql_sync_ficha_hogar'` | `'tdm_mysql_sync_discard'`,
   including `error` on failure — no raw PII field values in the logged `error` string
   (matches the existing constraint in spec 001's contract doc §5).
6. **On success**, writes back to the local `leads` row: `tdmSyncStatus = 'synced'`,
   `tdmLastSyncAt = now()`, and (Phase 1 only, or the Ficha-Hogar-as-fallback-insert
   path) `tdmLeadId = <insertId>`.

**Call-site expectations** (not enforced by the module, but required by the spec):

- All four call sites invoke these with `.catch(() => {})` or equivalent, in addition to
  the module's own internal catch, matching the "fire-and-forget, never blocks the user"
  requirement (FR-007) at both layers.
- `syncLeadFichaHogarComplete` is called independently of `persistTreintaPanelist`'s
  result in `completeFichaHogar` — the two are unrelated side effects (see plan.md
  Project Structure item 3).

## `field-map.ts` — pure, no I/O (used internally by `sync.ts`; exported for direct unit testing)

```ts
export function mapCoarseStatus(leadStatus: LeadStatus): string
export function mapShoppingCategories(ids: number[] | null): string | null
export function buildPhase1InsertRow(lead: Lead, profile: SurveyProfile): TbLeadsAgenteIaRow
export function buildFichaHogarUpdateRow(
  lead: Lead,
  profile: SurveyProfile,
  fichaHogar: FichaHogarProfile,
  summary: string | null,
): TbLeadsAgenteIaRow
export function buildDiscardUpdateRow(lead: Lead, profile: SurveyProfile): TbLeadsAgenteIaRow
```

Exact column-level behavior for each builder is specified in
[data-model.md](../data-model.md) §2-3. These functions never touch the network or a
database handle — `sync.test.ts` mocks around them at the I/O boundary; `field-map.test.ts`
calls them directly with in-memory fixtures.
