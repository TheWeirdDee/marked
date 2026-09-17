# Gate 11 §18-D — transaction rollback proof

## SqliteFulfillmentJobStore — proven for real, against a real forced failure

`packages/db/src/sqlite-fulfillment-job-store.test.ts`, `"SqliteFulfillmentJobStore — transaction rollback (Gate 11 §18-D)"`:

- **`"saveJobAndEvents: a failure appending the event rolls back the job write too — neither persists"`** — PASS. The test crafts an event object carrying a `BigInt` field (`{ ...ARM_EVENT, poisoned: 1n }`), which makes `JSON.stringify` throw a real `TypeError` — but only *inside* `saveJobAndEvents`'s transaction, after the job row's `INSERT` has already executed and before `COMMIT`. This is a genuine failure point inside the transaction, not a simulated one. The test asserts `store.get("job-1")` returns `null` and `store.getEvents("job-1")` returns `[]` afterward — the job insert that already ran was rolled back along with the event append that never got to run.
- **`"saveWithCas: a failure appending the event rolls back the CAS job write too — the pre-existing job is untouched"`** — PASS, same mechanism, but starting from a pre-existing `REVIEW_READY` job: after the forced mid-transaction failure, the job's status is still exactly `REVIEW_READY` (the attempted `ARMED` write never took effect) and no event was appended.

Mechanism proven: `SqliteFulfillmentJobStore.saveJobAndEvents`/`saveWithCas` wrap the job write and event append in one `BEGIN IMMEDIATE` / `COMMIT` transaction, with a `catch` block that issues `ROLLBACK` and re-throws. `node:sqlite`'s `DatabaseSync` gives this real ACID rollback semantics — confirmed by the test actually observing the pre-transaction state survive intact, not merely by reading the source code.

## PostgresFulfillmentJobStore — same mechanism, not exercised against a real connection

`PostgresFulfillmentJobStore.saveJobAndEvents`/`saveWithCas` both use `this.sql.begin(async (tx) => { ... })` — porsager/postgres's real transaction API, which issues `BEGIN`/`COMMIT` and automatically issues `ROLLBACK` if the callback throws or rejects. This is the standard, well-established mechanism for this driver, structurally identical in intent to the SQLite proof above. It has not been run against a real Postgres connection in this environment — see `environment-audit.md` and `gate11-result.md` for why, and what is needed to close the gap.
