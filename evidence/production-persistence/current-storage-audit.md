# Gate 11 — current storage architecture audit

Written before any architecture change, per Gate 11 §2. Every claim below traces to a specific file/line found by searching the repository — nothing here is assumed.

## 1. What interface currently represents persistence?

`packages/db/src/fulfillment-job-store.ts` exports `FulfillmentJobStore`:

```ts
export interface FulfillmentJobStore {
  save(job: FulfillmentJob): Promise<void>;
  get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null>;
  appendEvents(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void>;
  getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]>;
  listJobs(): Promise<readonly FulfillmentJob[]>;
}
```

All five methods are already `async` — the interface itself needed no change to accommodate a network-backed implementation.

Two implementations exist today:
- `InMemoryFulfillmentJobStore` (same file) — Gate 4's deterministic reference implementation, plus `exportSnapshot()`/`fromSnapshot()` used only to simulate restart in tests without a real process restart.
- `SqliteFulfillmentJobStore` (`packages/db/src/sqlite-fulfillment-job-store.ts`) — Gate 7's real, file-backed implementation via Node's built-in `node:sqlite`.

## 2. A real gap: `tryClaimExecution`/`getExecutionClaim`/`close()` are NOT on the interface

`SqliteFulfillmentJobStore` implements two additional methods the interface does not declare:

```ts
tryClaimExecution(requestHash: string, jobId: string, actor: string): { claimed: boolean; existingClaimJobId?: string }
getExecutionClaim(requestHash: string): { jobId: string; actor: string; claimedAt: string } | null
close(): void
```

Because these are not part of `FulfillmentJobStore`, every caller that uses them is typed against the **concrete** `SqliteFulfillmentJobStore` class, not the abstraction — this is the specific violation Gate 11 §3 asks to fix (business logic must depend on the interface, not a concrete store).

Concretely-typed call sites found (`grep SqliteFulfillmentJobStore`):
- `apps/web/src/lib/job-store.ts` — `getAppStore(): SqliteFulfillmentJobStore`, `ensureSandboxSeedJob(store: SqliteFulfillmentJobStore, ...)`, `ensureReviewReadyJob(store: SqliteFulfillmentJobStore, ...)`
- `apps/web/src/lib/fulfillment-actions.ts` — every exported function (`armJob`, `disarmJob`, `approveJob`, `getJobState`, `armDemoJob`, `disarmDemoJob`, `approveDemoJob`, `getDemoJobState`) types its `store` parameter as `SqliteFulfillmentJobStore`.
- `apps/web/src/lib/fulfillment-actions.test.ts` — constructs `SqliteFulfillmentJobStore` directly and calls `.close()`.

None of these actual call sites invoke `tryClaimExecution`/`getExecutionClaim` — every one of them only calls `save`/`get`/`appendEvents`/`getEvents`, all of which are already on the interface. This means retyping these signatures to `FulfillmentJobStore` is a mechanical, low-risk change once `tryClaimExecution`/`getExecutionClaim`/`close` are added to the interface itself.

`tryClaimExecution`/`getExecutionClaim` are exercised **only** by `packages/db/src/sqlite-fulfillment-job-store.test.ts` (Gate 7's own unit tests) and referenced conceptually in `packages/core/src/recovery.ts`'s `resolveDuplicateWorkerOutcome` doc comment. **No live route or Server Action in `apps/web` calls them today** — consistent with the already-established fact (Gate 8/product-repair audits) that the deployed app has no live KeeperHub-execution code path. This means Gate 11's atomic-claim work strengthens a proven-but-unwired mechanism; it does not change any currently-observable product behavior.

## 3. Which methods are used by the web application?

From `apps/web/src/lib/fulfillment-actions.ts` and `apps/web/src/lib/job-store.ts`: `save`, `get`, `appendEvents`, `getEvents`, `close` (only in `resetAppStoreForTests`, test-only). `listJobs` is used by `apps/web/src/app/app/page.tsx` (the dashboard) — confirmed via the `FulfillmentJobStore` interface doc comment ("Gate 9R — the application dashboard needs to list known jobs").

## 4. Which methods are used only in tests?

`tryClaimExecution`, `getExecutionClaim` (package-level tests only, see §2). `close()` is used by tests directly and by `job-store.ts`'s `resetAppStoreForTests` (also test-only).

## 5. How jobs are serialized

`SqliteFulfillmentJobStore.save`: `JSON.stringify(job)` into a single `TEXT` column (`job_json`). `get`: `JSON.parse(row.job_json)`. The entire `FulfillmentJob` — including the nested `FulfillmentCommitment` (chain id, Governor address, proposal id, `frozenActionAuthorizationHash`, `postconditionBindings`, etc.) — round-trips as one opaque JSON blob. No field is individually column-typed or reinterpreted. `packages/core/src/fulfillment-job.ts` confirms every field of `FulfillmentJob`/`FulfillmentJobEvent` is a plain string, number, boolean, or nested plain object — no `bigint`, no `Date`, no `Map` — so `JSON.stringify`/`JSON.parse` is lossless for this shape today (verified by reading the type definitions directly, not assumed).

## 6. How event history is stored

`job_events` table: `(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, seq INTEGER, event_json TEXT)`, with `idx_job_events_job_id ON job_events(job_id, seq)`. `appendEvents` reads `MAX(seq)` for the job, then inserts each new event at `nextSeq`, incrementing. `getEvents` reads `ORDER BY seq ASC`. There is no `UPDATE`/`DELETE` statement anywhere in the class for this table — append-only by construction, and proven so by a dedicated test (`"exposes no update/delete method for events"`).

## 7. How atomic state transitions work today

There is **no revision/compare-and-set column on `fulfillment_jobs` itself** — `save()` is a plain `INSERT ... ON CONFLICT(job_id) DO UPDATE`, i.e. last-write-wins on the job row. The only real compare-and-set in the current implementation is `execution_claims`, keyed by `request_hash` as the table's `PRIMARY KEY`: a second `INSERT` for the same hash raises a constraint violation, which `tryClaimExecution` catches and turns into `{ claimed: false }`. This is what Gate 7 actually proved as "duplicate-worker protection" — it protects against two workers claiming the *same execution request*, not against two workers racing to overwrite the same job row with different content. Gate 11's Postgres implementation must preserve exactly this semantic (a unique-constraint-backed claim table), and per Gate 11 §6 should additionally give the job row itself a real revision-based CAS path so `save()` can also detect a lost update, which the current SQLite implementation does not do.

## 8. How duplicate execution claims are prevented

Answered in §7 — a `PRIMARY KEY` uniqueness constraint on `execution_claims.request_hash`, with the second `INSERT`'s exception converted to a typed `{ claimed: false, existingClaimJobId }` result rather than propagating.

## 9. How restart recovery works

`job-store.ts`'s `getAppStore()` opens `SqliteFulfillmentJobStore` at a hardcoded local path (`join(process.cwd(), ".data", "marked.sqlite")`). Because it is a real file (not `:memory:`), closing the process and starting a new one against the same file recovers identical state — proven by `sqlite-fulfillment-job-store.test.ts`'s restart-survival tests (close one instance, open a fresh instance at the same path, read back identical job/events/claim) and by `evidence/recovery-hardening/live-restart-proof.md` (a real `taskkill /F` + `pnpm start` against the actual running app, not only the isolated test suite).

## 10. Whether any code assumes a single process

Yes, implicitly: `apps/web/src/lib/job-store.ts` holds `storeSingleton` as a module-level singleton, and `SqliteFulfillmentJobStore` itself holds one `DatabaseSync` handle per instance with no external locking beyond what SQLite's own file-level locking provides. This is exactly why it cannot serve as production persistence for Vercel's serverless model (documented in `VERCEL_ENVIRONMENT.md` from the prior audit): multiple concurrent serverless function instances have no shared process, and Vercel's deployment bundle filesystem is not durable/writable in the way this design assumes.

## 11. Whether SQLite-specific SQL has leaked into business logic

No. Every SQL statement lives inside `packages/db/src/sqlite-fulfillment-job-store.ts`. `apps/web/src/lib/fulfillment-actions.ts`, `apps/web/src/lib/job-store.ts`, and every Server Action/route calls only the interface-shaped methods (`save`/`get`/`appendEvents`/`getEvents`/`listJobs`) — no raw SQL, table name, or SQLite-specific type appears outside `packages/db`. This is the one respect in which the existing code already matches Gate 11's target architecture; the fix needed is narrower than a full rewrite — it is (a) widen the interface to cover `tryClaimExecution`/`getExecutionClaim`/`close`/a revision-based CAS for `save`, (b) retype the handful of call sites in §2 from the concrete class to the interface, and (c) add a second, interface-satisfying implementation.

## Conclusion — what Gate 11 actually needs to build

1. Extend `FulfillmentJobStore` with `tryClaimExecution`, `getExecutionClaim`, `close`, and a revision-aware compare-and-set path for job-status transitions (new methods, additive — does not change the five existing methods' signatures).
2. Retype `apps/web/src/lib/job-store.ts` and `apps/web/src/lib/fulfillment-actions.ts` (and their tests) from `SqliteFulfillmentJobStore` to `FulfillmentJobStore`.
3. Add `PostgresFulfillmentJobStore` implementing the same (now-complete) interface, with its own schema/migrations, preserving: JSON-blob job/event storage (no lossy column normalization), append-only event history, unique-constraint-backed execution claims, and a real revision column for job-level CAS.
4. Add an explicit driver-selection factory (`MARKED_STORAGE_DRIVER`) in `job-store.ts` that fails closed rather than silently defaulting to SQLite when Postgres is configured but unreachable/misconfigured.
