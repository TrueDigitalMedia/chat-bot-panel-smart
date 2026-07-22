# Contract: Writes to `db_kantar_leads.tb_leads_agente_ia` (external, TDM-owned)

Supersedes the write side ("§1 Sync qualified lead") of
[client-mysql-integration.md](../../001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md)
now that the real target table is known. That doc's §2 (registration code lookup) was
implemented on 2026-07-22 — see [registration-code.ts](../../../src/lib/tdm-mysql/registration-code.ts)
and the `trigger_code` job handler in
[api/jobs/re-engage/route.ts](../../../src/app/api/jobs/re-engage/route.ts). §3
(outcome monitoring) remains Option A only (user confirmation buttons) — unaffected.

## Direction

**Mostly write-only, with one read.** This feature's sync path (`buildLeadRow`/
`syncLead`) never issues a `SELECT` and never depends on any column TDM's internal
process writes back (`kantar_panelist_id`, etc. — see [data-model.md](../data-model.md)
§2e — those remain out of scope, spec FR-012). The one exception is `registration_code`:
once a lead is `link_sent`, a polling job reads that single column back (keyed by
`tdmLeadId`) to deliver the real code TDM generated — see
[client-mysql-integration.md §2](../../001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md).

## Operations

| Event | Operation | Key |
|---|---|---|
| Phase 1 complete, quota available | `INSERT` | none yet (first write for this lead) |
| Ficha Hogar complete | `UPDATE` if `leads.tdmLeadId` is set, else `INSERT` (fallback — see data-model.md §4) | `WHERE id = tdmLeadId` |
| Ficha Hogar discarded on Q1 | Same as above | `WHERE id = tdmLeadId` |

No `DELETE` is ever issued. No DDL (`ALTER`/`CREATE`) is issued — we have no permission
for it, and the table already exists.

## Column contract

See [data-model.md](../data-model.md) §2 for the full column-by-column map. Summary of
the guarantees:

- Every column this feature writes is either config-derived (`tenant_id`,
  `lead_version`), a direct copy of an already-captured bot field, or a documented
  best-effort/interpretive mapping (`status` bucket, `edad_ama_casa`,
  `discapacidad_total`) — never a fabricated value (spec FR-009).
- Columns with no reliable source on our side, or whose purpose in TDM's schema is
  ambiguous, are left `NULL` rather than guessed (spec FR-010, data-model.md §2e).
- `f1_lead_status` is write-once (set only by the Phase 1 insert); later updates never
  touch it, preserving the value at the moment quota was confirmed available.

## Failure handling

A rejected/failed write (auth failure, network error, constraint violation, connection
exhaustion) is caught by `sync.ts`, logged via `logCall`, and surfaced to the caller only
as a `false` return value — never as a thrown exception (see
[tdm-mysql-sync-module.md](tdm-mysql-sync-module.md)). No retry loop is built into this
feature; the next natural lifecycle event (if any) is the only retry path, per the
idempotency rules in data-model.md §4.

## Known accepted gap

If the `INSERT` succeeds on TDM's server but the process dies before the Postgres
write-back of `tdm_lead_id` completes, a later retry will `INSERT` again rather than
`UPDATE`, producing a duplicate row in `tb_leads_agente_ia`. There is no unique
constraint on their side (no phone/email uniqueness) for us to upsert against, and we
have no DDL access to add one. Accepted as a documented v1 risk (spec Assumptions) rather
than solved with an outbox/2PC mechanism.
