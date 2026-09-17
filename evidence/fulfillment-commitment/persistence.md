# Persistence and restart/reload

`packages/db/src/fulfillment-job-store.ts` implements the two tables Gate 4 needs from `packages/db/README.md`'s planned list: `fulfillment_jobs` and `job_events`. Everything else planned there (`governance_objects`, `authorizations`, `keeperhub_runs`, `postcondition_checks`, `receipts`) remains `NOT_IMPLEMENTED`.

## Interface

```ts
interface FulfillmentJobStore {
  save(job: FulfillmentJob): Promise<void>;
  get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null>;
  appendEvents(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void>;
  getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]>;
}
```

`InMemoryFulfillmentJobStore` is the deterministic reference implementation (Gate 4 instructions §10: "Do not require a production hosted database... but the storage interface must be real and deterministic"). No production Postgres/Drizzle exists yet; a future backing store must satisfy this exact interface.

## Append-only, by construction

There is deliberately no `updateEvents`, `deleteEvents`, or `clearEvents` method anywhere in `FulfillmentJobStore` — the only way to add to a job's event history is `appendEvents`, which concatenates onto the existing list and never removes or rewrites an existing entry. Proven directly in `fulfillment-job-store.test.ts` ("the store interface exposes no update or delete method for events") and by an ordering test appending five events and confirming they read back in the exact order appended.

## Restart/reload proof

`exportSnapshot()` / `InMemoryFulfillmentJobStore.fromSnapshot()` exist specifically to prove state survives a restart without requiring an actual OS process restart or a real database in this gate's test suite — the standard way to test a persistence interface's restart-survival property. `fulfillment-job-store.test.ts` proves:

1. A job plus its full event history, saved into one store instance, exported to a snapshot, and rehydrated into a **brand-new** store instance (simulating a fresh process), reads back byte-for-byte identical — `get()` and `getEvents()` both.
2. The frozen `commitment` object and its `fulfillmentCommitmentHash` specifically survive this round-trip unchanged.
3. The restarted instance is fully independent — mutating it does not affect the original, proving this is a genuine deep round-trip, not a shared in-memory reference accidentally passing the test.

## What is not implemented

No real network-backed database (Postgres/Drizzle) exists yet — this remains future work, explicitly deferred, not silently skipped (see `packages/db/README.md`). No `governance_objects`/`authorizations`/`keeperhub_runs`/`postcondition_checks`/`receipts` persistence exists — Gate 4 only needed `fulfillment_jobs` and `job_events` to prove commitment/state-machine correctness.
