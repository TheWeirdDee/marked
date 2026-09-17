# Gate 11 — production schema

Full DDL: `packages/db/migrations/0001_init.sql`. Applied via `pnpm db:migrate` (`packages/db/src/migrate.ts`), which tracks applied files in a `schema_migrations` table and is safe to re-run — every statement is `IF NOT EXISTS` guarded, and no statement in any migration drops or truncates a table.

## `fulfillment_jobs`

| Column | Type | Purpose |
|---|---|---|
| `job_id` | `TEXT PRIMARY KEY` | The `FulfillmentJobId` — stable, caller-assigned |
| `job_json` | `JSONB NOT NULL` | The entire canonical `FulfillmentJob` object — commitment, hash, status, timestamps — stored as one opaque, deterministic JSON value. **Never decomposed into typed columns.** No cryptographic value (`frozenActionAuthorizationHash`, `fulfillmentCommitmentHash`, addresses) is reinterpreted, re-derived, or reformatted by the database — the same JSON that was serialized is the same JSON read back. |
| `status` | `TEXT NOT NULL` | A copy of `job_json.status`, extracted only so `saveWithCas` can filter/compare it in a single SQL statement without parsing JSON first. Always written in the same statement as `job_json` — never an independent source of truth. |
| `revision` | `INTEGER NOT NULL DEFAULT 0` | Incremented on every update (`revision = revision + 1`). Not currently read by any caller outside the store implementation itself, but present for forward compatibility and to make "how many times has this row changed" independently auditable. |
| `updated_at` | `TEXT NOT NULL` | A copy of `job_json.updatedAt`, used for `listJobs`'s `ORDER BY updated_at DESC`. |

## `job_events`

| Column | Type | Purpose |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | Storage-internal row identity, never exposed |
| `job_id` | `TEXT NOT NULL` | Which job this event belongs to |
| `seq` | `INTEGER NOT NULL` | Per-job monotonic sequence, computed as `MAX(seq) + 1` for that `job_id` at append time — this is what makes `getEvents`'s `ORDER BY seq ASC` reproduce the exact append order |
| `event_json` | `JSONB NOT NULL` | The entire canonical `FulfillmentJobEvent` (`ArmEvent`/`DisarmEvent`/`ApprovalEvent`), same "opaque JSON, never decomposed" rule as `job_json` |

Indexed by `(job_id, seq)`. There is no `UPDATE`/`DELETE` statement targeting this table anywhere in `PostgresFulfillmentJobStore` — append-only by construction, matching `SqliteFulfillmentJobStore` and `InMemoryFulfillmentJobStore` exactly, and matching the `FulfillmentJobStore` interface itself (which declares no update/delete method for events at all).

## `execution_claims`

| Column | Type | Purpose |
|---|---|---|
| `request_hash` | `TEXT PRIMARY KEY` | Caller-computed identity for one specific execution attempt. The `PRIMARY KEY` constraint is the entire compare-and-set mechanism — see `evidence/production-persistence/atomicity.md`. |
| `job_id` | `TEXT NOT NULL` | Which job this claim is for |
| `actor` | `TEXT NOT NULL` | Which worker/actor claimed it |
| `claimed_at` | `TEXT NOT NULL` | ISO timestamp of the claim |

## `schema_migrations` (created by the migration runner itself, not this file)

| Column | Type | Purpose |
|---|---|---|
| `filename` | `TEXT PRIMARY KEY` | Which migration file has been applied |
| `applied_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | When |

## Why JSONB and not normalized columns

Gate 11 §5 explicitly warns against "casually normaliz[ing] cryptographic evidence into lossy columns." A `FulfillmentJob`'s `commitment` field nests a `FulfillmentCommitment` (chain id, Governor address, proposal id, `frozenActionAuthorizationHash`, `postconditionBindings[]`, execution surface/policy version) — decomposing that into relational columns would require this migration to encode assumptions about which fields matter, be kept in lockstep with `packages/core`'s types forever, and risk a column-width/type-coercion bug silently altering a hash-relevant value. Storing the exact same JSON `SqliteFulfillmentJobStore` already stores (verified byte-identical via the shared contract test suite — see `evidence/production-persistence/atomicity.md`) avoids all of that: the database is a faithful container for values `packages/core` already determined, never a second opinion about their shape.
