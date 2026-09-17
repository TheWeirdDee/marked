# Gate 11 — hosted production persistence proof

This file exists only because it is now genuinely true: a real hosted PostgreSQL database was migrated and exercised by the full test battery Gate 11's original prompt required, and every test passed for real. This file was not created until that was true — see `gate11-result.md`'s prior verdict ("BLOCKED — USER DATABASE SETUP REQUIRED") for the honest state before this happened.

## What database

A hosted Neon Postgres project (pooled endpoint, `...neon.tech`, `sslmode=require&channel_binding=require`), supplied by the user via the root `.env.local` (gitignored, never read into any tracked file or printed in any command output — see `security-scan.md`'s second pass). Neon was already established earlier in this gate (`architecture.md`) as the current default the Vercel Marketplace routes new Postgres projects to, since first-party "Vercel Postgres" was discontinued in December 2024 — confirmed live at the time via `vercel.com/docs/storage/vercel-postgres`. Nothing in `PostgresFulfillmentJobStore` is Neon-specific; it is a standard `postgres`-protocol connection.

## Migration, applied for real, twice

```
$ DATABASE_URL=<redacted> pnpm db:migrate
[apply] 0001_init.sql

$ DATABASE_URL=<redacted> pnpm db:migrate   # re-run, same database
[skip] 0001_init.sql (already applied)
```

Confirms `packages/db/src/migrate.ts`'s idempotency tracking (`schema_migrations`) against a real server, not just SQLite.

## The full Postgres test battery, run for real (60/60 passed, 0 failed, 0 skipped)

Full raw output: `evidence/production-persistence/hosted-postgres-test-output.txt` (ANSI color codes stripped; scanned and confirmed to contain zero occurrences of the real connection string or its password before being copied into this tracked directory — see `security-scan.md`).

| Gate 11 §18 requirement | Test file | Result |
|---|---|---|
| A — contract tests shared with SQLite | `postgres-fulfillment-job-store.contract.test.ts` (10 tests: `save`/`get`, upsert, `appendEvents` ordering, `listJobs` ordering, `saveJobAndEvents`, `saveWithCas`, `tryClaimExecution`, `getExecutionClaim` ×2) | **PASS**, all 10 |
| B — atomic concurrency (mandatory) | `postgres-fulfillment-job-store.hosted.test.ts`: `tryClaimExecution` race, `saveWithCas` race | **PASS**, both — exactly one winner in each `Promise.all` race |
| C — restart/reconnect | `postgres-fulfillment-job-store.hosted.test.ts`: job+events survive a brand-new connection, execution claim survives a brand-new connection | **PASS**, both |
| D — transaction rollback forcing a real failure (mandatory) | `postgres-fulfillment-job-store.hosted.test.ts`: `saveJobAndEvents` rollback, `saveWithCas` rollback, both via the BigInt-poisoned-event technique | **PASS**, both |
| E — serialization round-trip | `postgres-fulfillment-job-store.hosted.test.ts`: unicode/quotes/backslashes/newlines/emoji through JSONB, for both the job and an event | **PASS** |
| F — missing DB fails closed | Proven separately, no live DB required — `apps/web/src/lib/job-store.ts`'s `buildStore()` throws `PersistenceConfigurationError` when `MARKED_STORAGE_DRIVER=postgres` and `DATABASE_URL` is unset; unchanged by this section | **PASS** (pre-existing) |

Combined with the pre-existing SQLite/in-memory suite (43 tests) also re-run in the same session: **5 test files, 60 tests, 60 passed, 0 failed, 0 skipped** (`evidence/production-persistence/hosted-postgres-test-output.txt`, final lines).

## Two genuine bugs this real exercise surfaced (neither was a defect in `PostgresFulfillmentJobStore` itself)

Both are test-infrastructure/design gaps that only a REAL shared, persistent database — as opposed to SQLite's fresh-temp-file-per-test isolation — could have surfaced. Per Gate 11's explicit "do not weaken the test to get a PASS" instruction, both were fixed by making the tests correctly account for real infrastructure characteristics, not by loosening any assertion:

1. **Cross-file table-sharing race.** `postgres-fulfillment-job-store.contract.test.ts` and the new `postgres-fulfillment-job-store.hosted.test.ts` both hit the SAME physical `fulfillment_jobs`/`job_events`/`execution_claims` tables. Vitest runs test files in parallel by default; one file's per-test table wipe (`resetBeforeEach`, added to fix issue below) could fire mid-test in the other file, deleting rows the other file had just written and hadn't yet re-read. Fixed with `packages/db/vitest.config.ts` (`fileParallelism: false`), which was previously absent from this package.
2. **No per-test data isolation against a shared, persistent database.** The shared contract suite (`fulfillment-job-store.contract.ts`) uses fixed ids (`"contract-job-1"`, `"0xcontracthash"`, etc.) that never collide against SQLite (fresh temp file per `newStore()` call) but do collide against a real persistent table — both within a single run and across repeated runs. Fixed by adding an optional `resetBeforeEach` hook to the shared contract-test runner, wired up only for the Postgres path (`postgres-fulfillment-job-store.contract.test.ts`), which deletes all rows from the three tables before each test; the new `hosted.test.ts` file avoids the problem structurally instead, generating a fresh `crypto.randomUUID()`-suffixed id per test and cleaning up its own rows afterward.

A third, purely operational issue also surfaced and was fixed: vitest's default **test** timeout (5000ms) and default **hook** timeout (10000ms) are both tooling limits sized for fast local operations, not for genuine Neon network round trips (observed 3.6s-13.8s per round trip in this environment, including one cold-start-affected run that legitimately needed to wait for the compute to wake — see below). Fixed by raising both: `testTimeout` passed per-call into the contract runner (20s for the Postgres file only; SQLite is unaffected and stays on the default), and `hookTimeout: 20_000` in the new `vitest.config.ts` (package-wide, but harmless for the sub-100ms SQLite hooks).

## An observed, undisguised flake: Neon cold start

Two early attempts to run this suite failed everything in both Postgres files with `write CONNECT_TIMEOUT undefined:undefined` — a real connection failure, not invented. Root cause: this gate's `probeAndMigrate()` helper (used to decide whether to run live or report `it.skip`) used a 5-second `connect_timeout`, too tight for this Neon project's compute to wake from scale-to-zero on the first connection of a session. A direct, isolated connection attempt with a 10-15s timeout succeeded immediately once the compute was already warm, confirming the diagnosis. Fixed by raising `connect_timeout` to 15s in both probe functions — a genuine correctness fix for real serverless-Postgres behavior, not a retry-until-lucky workaround; the final, reported PASS run (60/60) reflects this fix already in place, run from a freshly-cleaned table state.

This cold-start behavior is itself a real, honest data point for Vercel deployment readiness and is called out again in `VERCEL_ENVIRONMENT.md`/`architecture.md` context: the first request to a cold Marked deployment after a period of no traffic may see elevated latency on its first database call while Neon's compute wakes. This does not affect correctness (every test above passed once connected) — only first-request latency.

## What this proves, precisely

- `FulfillmentJobStore` is genuinely interchangeable between `SqliteFulfillmentJobStore` and `PostgresFulfillmentJobStore` — the identical contract-test battery passes against both, unmodified between runs.
- Postgres's own row-level locking and constraint enforcement — not application-level coordination — is what resolves the mandatory concurrent-worker race to exactly one winner, against a real server.
- `sql.begin()` transactions genuinely roll back on a real failure mid-transaction against a real Postgres engine, not merely per the driver's documentation.
- A brand-new `PostgresFulfillmentJobStore` connection (standing in for a fresh serverless invocation) reads back exactly what a prior, now-closed connection wrote.
- JSONB round-trips unicode, quotes, backslashes, newlines, and emoji byte-for-byte.
- Migrations are idempotent against a real server, applied twice with the expected `[apply]`/`[skip]` behavior.

## What this does NOT prove (scope discipline, per Gate 11's claim-language requirements)

- This is not a load test — no throughput/latency SLO is claimed beyond "cold start adds first-request latency; warm requests observed 3.6-8s per round trip in this specific free-tier Neon project from this specific development machine's network."
- This is not a proof of Vercel's own serverless runtime — the tests ran from a local Node process against the hosted database, not from an actual deployed Vercel function. `architecture.md`'s serverless connection-handling section remains a documented design (`max: 1`), not something this test battery could exercise directly.
- No blockchain write of any kind occurred in this section — every action here is SQL against Postgres and TypeScript test code.
