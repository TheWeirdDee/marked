# Gate 11 — restart/reconnect proof

Full console output: `evidence/production-persistence/packages-db-test-output.txt` (SQLite/in-memory) and `evidence/production-persistence/hosted-postgres-test-output.txt` (real hosted Neon Postgres).

## SqliteFulfillmentJobStore — proven for real

`sqlite-fulfillment-job-store.test.ts`:
- `"a job persisted in one process instance is readable from a brand-new instance pointed at the same file (simulated restart)"` — PASS. Saves a job + appends an event via one `SqliteFulfillmentJobStore` instance, closes it, opens a completely new instance at the same file path, reads both back byte-identical.
- `"an execution claim persisted before a crash is still visible after restart (execution identity survives reload, §26 test 2)"` — PASS.
- `"survives a restart with both halves intact"` (new, `saveJobAndEvents`) — PASS.
- `"returns every saved job, most-recently-updated first, surviving a restart"` (`listJobs`) — PASS.

This extends Gate 7's own restart proof (`evidence/recovery-hardening/live-restart-proof.md` — a real `taskkill /F` + `pnpm start` against the actual running app, not only the isolated test suite) to the new methods added in this gate.

## PostgresFulfillmentJobStore — proven for real, against a real hosted connection (Neon)

A "restart" for a network-backed store means: write with one client connection, fully close it, open a brand-new client connection (simulating a fresh serverless invocation), read back identical state. `packages/db/src/postgres-fulfillment-job-store.contract.test.ts` proves exactly this via its `newStore()`/`disposeStore()` pattern (a fresh connection per test) — every test in that file, including the round-trip and `listJobs` assertions, passed against the real hosted database.

`packages/db/src/postgres-fulfillment-job-store.hosted.test.ts` adds an explicit, named restart proof mirroring the SQLite test above:
- **`"a job persisted by one store instance is readable from a brand-new instance pointed at the same DATABASE_URL"`** — PASS. Saves a job + appends an event via one `PostgresFulfillmentJobStore` connection, closes it, opens a brand-new instance against the same `DATABASE_URL` (standing in for a fresh serverless invocation), reads both back identical.
- **`"an execution claim persisted before a crash is still visible after reconnect"`** — PASS, same pattern for `tryClaimExecution`/`getExecutionClaim`.

Full output: `evidence/production-persistence/hosted-postgres-test-output.txt`; narrative: `evidence/production-persistence/hosted-production-proof.md`.
