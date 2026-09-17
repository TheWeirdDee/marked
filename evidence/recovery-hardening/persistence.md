# Gate 7 Part 17 — persistence

## Decision

`packages/db/src/sqlite-fulfillment-job-store.ts` (`SqliteFulfillmentJobStore`) — a real, file-backed,
transactional database using Node's built-in `node:sqlite` module. Zero new npm dependencies. Implements
the exact same `FulfillmentJobStore` interface Gate 4's `InMemoryFulfillmentJobStore` already satisfies, so
either can be swapped in without touching any caller.

## Why not a hosted database

A full Postgres/Drizzle rollout this close to a hackathon deadline would either be rushed (new infra,
new connection handling, new failure modes, all unproven under time pressure) or eat time better spent on
the judge-facing product. `node:sqlite` converts "survives restart: no" into "survives restart: yes" with
the smallest possible change in surface area. See `DEC-021`.

## Schema

```sql
CREATE TABLE fulfillment_jobs (
  job_id TEXT PRIMARY KEY,
  job_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_json TEXT NOT NULL
);
CREATE INDEX idx_job_events_job_id ON job_events(job_id, seq);
CREATE TABLE execution_claims (
  request_hash TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
```

- `job_events` has no `UPDATE`/`DELETE` statement anywhere in the store class — append-only by construction,
  matching Gate 4's `InMemoryFulfillmentJobStore` guarantee.
- `execution_claims.request_hash` is the table's `PRIMARY KEY` — this is what makes duplicate-worker
  protection (Part 16.I) a real storage-level compare-and-set rather than an application-level race check.
  See `evidence/recovery-hardening/recovery-scenarios.md` scenario I.

## Honesty boundary

`node:sqlite` is an experimental Node.js API (stable in no current LTS as of this writing). This is a
single-file, single-process database: no replication, no connection pooling, no multi-region durability.
It is a genuine upgrade over Gate 4's in-memory store (which does not survive restart at all) and a real
demonstration that the `FulfillmentJobStore` interface can be satisfied by an actual database. It is not,
and is never claimed to be, production-grade distributed infrastructure — see `CLAIMS.md` Gate 7's
"Explicitly not claimed" section.

## Proof

- `packages/db/src/sqlite-fulfillment-job-store.test.ts` (11/11) — save/get/upsert, restart survival via a
  real file close + reopen (`mkdtempSync`, not merely an in-memory object), execution-claim survival across
  restart, append-only event ordering, no update/delete method exists, and a simulated concurrent-worker
  race (two store instances on the same file, only one claim succeeds).
- `evidence/recovery-hardening/live-restart-proof.md` — the same guarantee proven against the actual running
  `apps/web` production build, not only the isolated test suite: a hard `taskkill /F`, a fresh
  `pnpm start`, identical job + event state read back.

## What lives where

- `apps/web`'s recovery sandbox: `apps/web/.data/recovery-sandbox.sqlite` (gitignored — `*.sqlite` in the
  root `.gitignore`). Entirely separate from `evidence/` — see `demo-store.test.ts` test 30.
- Package-level tests: a fresh `mkdtempSync` temp file per test, cleaned up in `afterEach`.
