# Phase 0 Research: Sync de Leads a TDM (Solo Escritura)

All design decisions for this feature were already made by the requester before planning
began (field mapping, module layout, idempotency strategy, config surface). This document
records the technical rationale behind the decisions that needed evaluation against the
existing codebase, so nothing here reopens a question the spec/input already answered.

## R1: MySQL client library

**Decision**: `mysql2` (specifically its `mysql2/promise` entry point).

**Rationale**: It's the de facto standard promise-based MySQL driver for Node — actively
maintained, supports connection pooling and TLS out of the box, and needs no additional
adapter to work with plain `execute()`/parameterized queries. The project has no ORM
that targets MySQL (Drizzle is configured for Postgres only via `@neondatabase/serverless`
in [client.ts](../../src/lib/db/client.ts)), and introducing one for a two-table, two-query
integration would be unjustified complexity under the project constitution's Simplicity
principle. Raw parameterized `execute()` calls against a typed row shape
(`TbLeadsAgenteIaRow`) are sufficient.

**Alternatives considered**:
- `mysql` (legacy, callback-based, unmaintained) — rejected, no promise API.
- An ORM/query builder (Kysely, Prisma) — rejected as unjustified weight for a
  single-table write integration; violates Simplicity/YAGNI (Principle III).

## R2: Connection pooling shape for a serverless caller against one traditional MySQL server

**Decision**: `mysql2.createPool({ connectionLimit: 1, waitForConnections: true, connectTimeout: 5000, enableKeepAlive: false })`, instantiated lazily and cached as a module-level singleton per process (mirrors the existing lazy-singleton shape used for the Postgres `sql`/`db` clients in [client.ts](../../src/lib/db/client.ts), adapted for the fact that Vercel serverless functions each get their own process).

**Rationale**: Vercel functions are independent, ephemeral processes; many of them can be
warm concurrently, each holding its own pool. A traditional MySQL server (unlike Neon's
HTTP-based Postgres proxy) has a hard, often low, max-connections ceiling. Capping each
process's pool at 1 connection bounds the worst case (N warm functions → at most N
connections) without needing an external connection proxy, which is out of scope for a
client-owned server we don't operate. `waitForConnections: true` queues rather than
throws under a rare local burst (Phase 1 completion and Ficha Hogar completion are not
concurrent for the same lead, so queuing depth is expected to be ~0-1).
`enableKeepAlive: false` avoids holding the one connection open between invocations,
since serverless function instances can be frozen/reaped between requests.

**Alternatives considered**:
- Higher `connectionLimit` (e.g. 5-10) — rejected, multiplies against Vercel's
  concurrent-invocation scaling and risks exhausting TDM's MySQL server's max-connections
  without our control over that server's configuration (no DDL/admin access — see
  [spec.md](spec.md) context).
- A connection-proxy layer (PgBouncer-style) — rejected as out of scope; TDM owns the
  target server and no such proxy was offered.

## R3: Idempotency strategy given no unique constraint on the target table

**Decision**: Store the MySQL-assigned `AUTO_INCREMENT` id (`tdm_lead_id`) back on the
Postgres `leads` row after a successful insert; use it as the `WHERE id = ?` key for the
Ficha Hogar update. Guard the Phase 1 insert with a `tdmLeadId IS NOT NULL` check before
attempting it again.

**Rationale**: This is the only idempotency lever available without write access to the
target schema (no DDL permission — confirmed in the feature's context). It fully
prevents duplicates on the common retry path (a Phase 1 sync that already succeeded).
The one gap — a crash between a successful MySQL `INSERT` and the Postgres write-back of
`tdm_lead_id` — is accepted as a documented risk for v1 per the spec's Assumptions
section and edge cases; building an outbox/2PC mechanism to close that gap is
disproportionate to a low-frequency, non-financial data sync and would violate the
constitution's Simplicity principle.

**Alternatives considered**:
- Application-level dedup via a lookup-before-insert on `phone` — rejected: not
  guaranteed unique in the target table (multiple household members could share a
  contact number), and doing a `SELECT` before every `INSERT` adds a network round trip
  and a race window without actually closing the gap described above.
- Outbox/2PC pattern — rejected as disproportionate complexity for this risk profile
  (see FR-004/FR-005 and the spec's accepted-risk Assumption).

## R4: Fire-and-forget integration shape at the four call sites

**Decision**: Each call site awaits the sync function (so `tdmLeadId`/status get written
before the caller proceeds where that matters, e.g. the Ficha Hogar update needing
Phase 1's `tdmLeadId`), but the sync function itself never throws or returns a rejected
promise — every internal failure is caught and logged, returning `false` instead of
propagating. This mirrors the codebase's two existing analogous patterns:
`persistTreintaPanelist` ([persist-panelist.ts](../../src/lib/treinta/persist-panelist.ts),
`catch (err) { console.error(...); return false }`) and the fire-and-forget
`void import(...).then(...).catch(...)` used for the Phase-1 eval side effect in
[state-machine/index.ts](../../src/lib/state-machine/index.ts).

**Rationale**: The user-facing conversation must never be blocked or broken by a
third-party system being slow or unavailable (constitution requires observability, not
that every side effect be synchronous-and-safe to fail loudly). Awaiting (rather than
literally firing a detached promise) keees ordering correct — the Ficha Hogar branch
needs to read `tdmLeadId` that Phase 1's sync wrote — while the try/catch-and-return-bool
contract keeps failures non-fatal to the caller.

**Alternatives considered**:
- True detached fire-and-forget (`void syncLeadPhase1Complete(...)`, uncaptured) —
  rejected because the Ficha Hogar update needs to read back `tdmLeadId`, so the write
  must complete (or fail) before that later step runs.

## R5: Configuration surface

**Decision**: Extend `src/lib/env.ts` with `CLIENT_MYSQL_*` optional Zod fields (all
`.optional()` except `CLIENT_MYSQL_SYNC_ENABLED`, which defaults `false`, and
`CLIENT_MYSQL_PORT`, which defaults `3306`), plus two paired `isClientMysqlConfigured()` /
`isClientMysqlSyncEnabled()` helpers, mirroring the existing `isMetaWhatsAppConfigured()`
/ `isTwilioConfigured()` pattern in the same file.

**Rationale**: Matches the project's one established convention for "this integration
may or may not be turned on in this environment" (WhatsApp provider selection). Keeps
the sync fully opt-in and safe to deploy with `CLIENT_MYSQL_SYNC_ENABLED` unset —
`validateEnv()` won't reject a deployment missing MySQL credentials, and
`isClientMysqlSyncEnabled()` composes the flag with configuredness so callers get a
single boolean gate.

**Alternatives considered**: None — this is a direct extension of an existing,
already-approved pattern in the file.

## R6: Relationship to the existing spec 001 contract doc

**Decision**: This feature supersedes the "1. Sync qualified lead (write)" section of
[client-mysql-integration.md](../001-panelsmart-recruitment-bot/contracts/client-mysql-integration.md)
with the now-known real target table (`tb_leads_agente_ia`) and column map. Sections 2
("Registration code lookup") and 3 ("Registration outcome monitoring") of that contract
remain unimplemented and out of scope here — the mock registration code path is
untouched (spec's FR-011).

**Rationale**: The original contract was written before TDM's schema was known and
described the write side generically ("exact column map: TBD"). That gap is now filled;
the read-side contract (code lookup) depends on TDM's internal process actually writing
back, which hasn't been confirmed operational yet, so it stays deliberately deferred.
