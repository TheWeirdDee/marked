# @marked/db

## Responsibility

Persistence boundary for Marked. Local development and tests use `node:sqlite` (`SqliteFulfillmentJobStore`); production uses PostgreSQL via the `postgres` driver (`PostgresFulfillmentJobStore`, Gate 11) — both implement the same `FulfillmentJobStore` interface, selected explicitly by `apps/web/src/lib/job-store.ts` via `MARKED_STORAGE_DRIVER`, never inferred from `NODE_ENV`. See `evidence/production-persistence/architecture.md` for the full picture and `VERCEL_ENVIRONMENT.md` for exactly which environment variables production needs.

## Status

`fulfillment_jobs`, `job_events`, and `execution_claims` are implemented — see `src/fulfillment-job-store.ts` (the interface + `InMemoryFulfillmentJobStore`), `src/sqlite-fulfillment-job-store.ts`, and `src/postgres-fulfillment-job-store.ts`. The other planned tables below remain `NOT_IMPLEMENTED`.

Schema for the Postgres store lives in `migrations/0001_init.sql`, applied via `pnpm db:migrate` (`src/migrate.ts`) — an explicit, repeatable, idempotent runner, never invoked automatically by the app itself.

## Planned tables (documentation only except where noted)

- `governance_objects` — resolved Cactus + Governor identity for a proposal. Not yet implemented.
- `authorizations` — frozen action-authorization hashes and the canonical action bundle they were computed from. Not yet implemented (Gate 2 computes these; nothing persists them yet).
- `fulfillment_jobs` — the commitment + state machine status for one armed job. **Implemented** — `FulfillmentJobStore.save`/`get`/`saveJobAndEvents`/`saveWithCas` (Gate 4, extended Gate 11).
- `keeperhub_runs` — run/execution IDs, workflow export references, status. Not yet implemented.
- `postcondition_checks` — evaluated `BoundPostcondition` results with evidence block references. Not yet implemented.
- `receipts` — the final proof bundle a third party can recompute via `marked verify`. Not yet implemented.
- `job_events` — **append-only**. Corrections append a new event; nothing here is ever rewritten or deleted. This is a hard rule, not a convention — see BUILD_CONTRACT.md and PRD.md §14. **Implemented** — `FulfillmentJobStore.appendEvents`/`getEvents`; the interface deliberately has no update/delete method for events, in either the SQLite or Postgres implementation.
- `execution_claims` — Gate 7's duplicate-worker protection, a real storage-level compare-and-set on a unique `request_hash`. **Implemented** in both `SqliteFulfillmentJobStore` and `PostgresFulfillmentJobStore` via `tryClaimExecution`/`getExecutionClaim`, now part of the `FulfillmentJobStore` interface itself (Gate 11 — previously SQLite-only, callers had to depend on the concrete class).

## Why raw SQL, not an ORM

Gate 11 evaluated Drizzle (the originally-planned target) against a minimal `postgres`-driver implementation and chose the latter: five methods over three tables did not justify an ORM dependency, and the existing `SqliteFulfillmentJobStore` already used raw prepared statements — matching that style keeps both implementations easy to compare line-by-line. See `evidence/production-persistence/architecture.md` for the full reasoning, including why `postgres` (porsager/postgres) specifically was chosen over Vercel-specific or Neon-specific drivers.
