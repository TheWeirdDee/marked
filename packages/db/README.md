# @marked/db

## Responsibility

Persistence boundary for Marked. Production target is Drizzle ORM over PostgreSQL; tests use an ephemeral database. See PRD.md §14.

## Status

`fulfillment_jobs` and `job_events` are implemented as of Gate 4 — see `src/fulfillment-job-store.ts`. Everything else below remains `NOT_IMPLEMENTED`. Drizzle/PostgreSQL is still not installed; Gate 4's `InMemoryFulfillmentJobStore` is the deterministic reference implementation the interface (`FulfillmentJobStore`) is designed for a real backing store to satisfy identically later, per the Gate 4 instructions' "storage interface must be real and deterministic, a production hosted database is not required."

## Planned tables (documentation only except where noted)

- `governance_objects` — resolved Cactus + Governor identity for a proposal. Not yet implemented.
- `authorizations` — frozen action-authorization hashes and the canonical action bundle they were computed from. Not yet implemented (Gate 2 computes these; nothing persists them yet).
- `fulfillment_jobs` — the commitment + state machine status for one armed job. **Implemented (Gate 4)** — `FulfillmentJobStore.save`/`get`.
- `keeperhub_runs` — run/execution IDs, workflow export references, status. Not yet implemented.
- `postcondition_checks` — evaluated `BoundPostcondition` results with evidence block references. Not yet implemented.
- `receipts` — the final proof bundle a third party can recompute via `marked verify`. Not yet implemented.
- `job_events` — **append-only**. Corrections append a new event; nothing here is ever rewritten or deleted. This is a hard rule, not a convention — see BUILD_CONTRACT.md and PRD.md §14. **Implemented (Gate 4)** — `FulfillmentJobStore.appendEvents`/`getEvents`; the interface deliberately has no update/delete method for events.

## Why no schema yet

The prompt authorizing Gate 0 explicitly scopes schema design to a later gate ("Do NOT spend this gate building every schema if the PRD does not require it yet"). Building the schema now, before Gate 2–6 have defined the exact shape of a commitment, authorization, and receipt, risks a schema that has to be redesigned rather than extended.
