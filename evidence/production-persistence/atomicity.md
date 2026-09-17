# Gate 11 — atomic compare-and-set proof

Full console output: `evidence/production-persistence/packages-db-test-output.txt`.

## What was proven for real, against `SqliteFulfillmentJobStore`

`node:sqlite`'s `DatabaseSync` provides real ACID transactions and file-level locking, so these are genuine proofs against a real database engine — not mocked SQL.

**Execution-claim compare-and-set** (Gate 7's original mechanism, `packages/db/src/sqlite-fulfillment-job-store.test.ts`):
- `"the first worker to claim a request hash succeeds"` — PASS
- `"a second worker claiming the SAME request hash is refused, and told who already claimed it"` — PASS
- `"two DIFFERENT request hashes (e.g. different jobs) do not collide"` — PASS
- **`"simulates two concurrent workers racing for the same job: only one logical execution proceeds"`** — PASS. Two separate `SqliteFulfillmentJobStore` instances open the same on-disk file (`storeA`, `storeB` — genuinely separate handles, not the same object), both call `tryClaimExecution("0xsharedrequest", "job-1", ...)` for the same request hash, and the test asserts exactly one of the two returned `claimed: true`. This is the Gate 11 §6 mandatory test, run for real.

**Job-level compare-and-set** (new in this gate, `SqliteFulfillmentJobStore.saveWithCas`):
- `"succeeds when expectedCurrentStatus matches the real current status"` — PASS
- `"succeeds when expectedCurrentStatus is null and the job does not exist yet"` — PASS
- `"refuses (without writing) when the real current status does not match expectedCurrentStatus"` — PASS, and explicitly asserts the refused write left both the job row and the event history untouched (`store.get` still shows the pre-conflict status, `store.getEvents` is still empty)
- **`"two concurrent CAS attempts against the same expected status: exactly one succeeds"`** — PASS. Two store instances on the same file both attempt `saveWithCas` with the same `expectedCurrentStatus`, issued via `Promise.all` (genuinely concurrent, not sequential); exactly one of the two results has `ok: true`.

**Contract-suite confirmation** (`packages/db/src/fulfillment-job-store.contract.ts`, run via `sqlite-fulfillment-job-store.contract.test.ts`): the same `saveWithCas`/`tryClaimExecution` assertions, written independently of the tests above, also pass against `SqliteFulfillmentJobStore` — this is the "same behavior, two independently-written test paths" pattern this project has used since Gate 8's historical-baseline verifier.

## What is implemented but NOT proven against a real Postgres engine

`PostgresFulfillmentJobStore.saveWithCas` and `.tryClaimExecution` are implemented using single-statement atomic SQL (`UPDATE ... WHERE status = expected` / `INSERT ... ON CONFLICT DO NOTHING`, both with `RETURNING`) — Postgres's own row-level locking is what would make two concurrent callers resolve to exactly one winner, the same principle the SQLite implementation already proves, just expressed in Postgres's own atomic-statement idiom rather than SQLite's exception-on-constraint-violation idiom.

`packages/db/src/postgres-fulfillment-job-store.contract.test.ts` runs the exact same contract battery (`fulfillment-job-store.contract.ts`) against `PostgresFulfillmentJobStore` that was just proven against SQLite above — **but it is currently SKIPPED**, because no reachable Postgres (local, containerized, or hosted) exists in this environment (see `evidence/production-persistence/environment-audit.md` and `gate11-result.md`). The skip is explicit and visible in test output (`↓ ... SKIPPED — no reachable/migratable Postgres in this environment (DATABASE_URL is not set)`), never a silent pass.

**This gate does not claim the Postgres concurrency behavior has been exercised against a real Postgres server.** It claims the implementation is complete, uses the correct atomic-statement pattern, and is proven identical in intent to the already-real-database-proven SQLite implementation via a shared contract suite that will run the moment a real `DATABASE_URL` is supplied — see item 49 of the final report for exactly what is needed to close this gap.
