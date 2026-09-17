# Gate 11 — restart/reconnect proof

Full console output: `evidence/production-persistence/packages-db-test-output.txt`.

## SqliteFulfillmentJobStore — proven for real

`sqlite-fulfillment-job-store.test.ts`:
- `"a job persisted in one process instance is readable from a brand-new instance pointed at the same file (simulated restart)"` — PASS. Saves a job + appends an event via one `SqliteFulfillmentJobStore` instance, closes it, opens a completely new instance at the same file path, reads both back byte-identical.
- `"an execution claim persisted before a crash is still visible after restart (execution identity survives reload, §26 test 2)"` — PASS.
- `"survives a restart with both halves intact"` (new, `saveJobAndEvents`) — PASS.
- `"returns every saved job, most-recently-updated first, surviving a restart"` (`listJobs`) — PASS.

This extends Gate 7's own restart proof (`evidence/recovery-hardening/live-restart-proof.md` — a real `taskkill /F` + `pnpm start` against the actual running app, not only the isolated test suite) to the new methods added in this gate.

## PostgresFulfillmentJobStore — NOT exercised against a real connection

A "restart" for a network-backed store means: write with one client connection, fully close it, open a brand-new client connection (simulating a fresh serverless invocation), read back identical state. `packages/db/src/postgres-fulfillment-job-store.contract.test.ts` is structured to prove exactly this (the contract suite's `newStore()`/`disposeStore()` pattern opens and closes a real connection per test), but — as documented in `atomicity.md` and `environment-audit.md` — it is currently SKIPPED because no reachable Postgres exists in this environment.

No restart/reconnect claim is made for `PostgresFulfillmentJobStore` beyond "the code is written to prove it and will run the moment a real `DATABASE_URL` is supplied."
