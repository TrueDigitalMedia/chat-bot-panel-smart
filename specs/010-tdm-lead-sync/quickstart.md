# Quickstart: Validating the TDM Lead Sync

No real connectivity to TDM's MySQL server (`tdm-out-01.boa-analytics.com`) is available
in this environment or CI — all validation below is against mocks and local Postgres.
Do not attempt a real connection without the user's explicit authorization first (same
policy as this project's real-Neon validation runs).

## Prerequisites

- `.env.local` with the existing Postgres/Telegram/etc. vars already set up for local dev
  (see `.env.example`).
- `CLIENT_MYSQL_SYNC_ENABLED` left `false`/unset for all steps below except where noted —
  this feature must be provably inert by default (spec SC-003).

## 1. Unit tests — pure mapping logic (no mocks needed)

```bash
npx vitest run src/lib/tdm-mysql/field-map.test.ts
```

**Expect**: every mapping row from [data-model.md](data-model.md) §2-3 covered — each
`mapCoarseStatus` bucket, `mapShoppingCategories` id→label join (including an unknown-id
and an empty/`null` input case), and every field the row-builders (`buildPhase1InsertRow`,
`buildFichaHogarUpdateRow`, `buildDiscardUpdateRow`) leave `NULL` per data-model.md §2e.

## 2. Unit tests — orchestration with mocked MySQL/Postgres

```bash
npx vitest run src/lib/tdm-mysql/sync.test.ts
```

**Expect** (per [tdm-mysql-sync-module.md](contracts/tdm-mysql-sync-module.md)):
- Sync disabled → each of the three `sync*` functions no-ops and returns `true` without
  touching the mocked pool.
- Sync enabled + mocked MySQL success → the mocked `execute()` is called with the
  expected row shape; `leads.tdmLeadId`/`tdmSyncStatus`/`tdmLastSyncAt` are written via
  the mocked Postgres `db`.
- Mocked MySQL `execute()` throws → function returns `false`, `logCall` is called with a
  populated `error`, and — critically — the test asserts no exception escapes the
  function call (the call site's `await` must resolve, not reject).

## 3. Full regression pass

```bash
npx vitest run tests/unit
npx tsc --noEmit
```

**Expect**: all tests pass; the only pre-existing `tsc` error is the known unrelated one
in `persist-eval.ts` (documented in prior specs) — zero new errors.

## 4. End-to-end smoke test against local Postgres (sync disabled)

Run the bot locally (existing dev workflow) and drive a lead through Phase 1 to
quota-available and through Ficha Hogar completion, exactly as before this feature.

**Expect**: identical behavior to before this change — no new columns populated on
`leads` (`tdm_lead_id`/`tdm_sync_status`/`tdm_last_sync_at` stay `NULL`), no new log
lines with `call_type` starting `tdm_mysql_sync_`, confirming SC-003 (zero behavior
change when disabled).

## 5. End-to-end smoke test with sync "enabled" but unconfigured

Set `CLIENT_MYSQL_SYNC_ENABLED=true` locally, leave `CLIENT_MYSQL_HOST`/etc. unset. Repeat
step 4.

**Expect**: same as step 4 — `isClientMysqlConfigured()` is `false`, so
`isClientMysqlSyncEnabled()` stays `false` and every `sync*` call still no-ops. This
proves FR-006's "opt-in without requiring code changes, and safe even if half-configured"
guarantee.

## Not covered here (needs the user's explicit go-ahead first)

Connecting to the real TDM MySQL server to confirm a live `INSERT`/`UPDATE` actually
lands correctly in `tb_leads_agente_ia`, and resolving the open questions in
[spec.md](spec.md) (`tenant_id`/`lead_version` values, status bucket confirmation, TLS
requirement) with TDM directly.
