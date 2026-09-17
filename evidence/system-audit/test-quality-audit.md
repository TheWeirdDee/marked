# Gate 12 §32/§33/§56 — test-suite quality, destructive-DB-test safety, repeated/flake testing

## §32 — Finding tests that could pass for the wrong reason

Grep across every `*.test.ts` in the repo for patterns that would indicate a weak test: `it.skip`/`it.todo` outside the two deliberate, explicitly-reasoned Postgres skip guards (`postgres-fulfillment-job-store.contract.test.ts`/`.hosted.test.ts` — both print a full, specific reason string, never a silent skip); no test file was found with an assertion inside a conditional that could be skipped entirely at runtime; no test mocks the exact function it claims to test (e.g. the concurrency tests use two genuinely independent `SqliteFulfillmentJobStore` instances, not two references to the same object — verified by reading the fix, not merely trusting a description). The rate-limit tests (F-04) inject an explicit `now` timestamp rather than relying on wall-clock `Date.now()` + `sleep()`, so they are not clock-flake-prone.

**Fixed-ID collisions against persistent state**: this was Gate 11's own class of bug (fixed contract-test ids colliding against a real hosted database) — this gate's new tests deliberately avoid the same trap: `fulfillment-actions.test.ts`'s new concurrency tests use fresh temp-file SQLite stores per test (via the existing `beforeEach`), and `postgres-fulfillment-job-store.hosted.test.ts` (Gate 11) already uses `crypto.randomUUID()`-suffixed ids specifically to avoid this.

**5-second assumptions / sleep-based races**: none found in this gate's new tests. The rate-limit tests pass explicit timestamps rather than sleeping; the concurrency tests race via `Promise.all`, not via timed delays.

## §33 — Destructive DB test safety (the gate's own explicit top priority)

See finding F-02 in `findings.md` and `database-audit.md` §11 for the full account. Summary: fixed via a mandatory, explicit `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` second opt-in, verified in both directions (blocks by default even with `DATABASE_URL` reachable; genuinely runs the real suite when both are set).

## §56 — Repeated/flake testing

Re-ran the new concurrency tests (`fulfillment-actions.test.ts`) and the new state-machine reachability test 3 times each in this gate's session (as part of iterative fix verification, not a separate dedicated flake-hunt) — consistently passing, no flake observed. The one genuine flake observed anywhere this gate (a Neon cold-start timeout on one of the live hosted-Postgres runs, `evidence/production-persistence/hosted-production-proof.md`, pre-dating this gate) was correctly classified as latency, not correctness — per this gate's own explicit instruction not to raise a timeout without first ruling out a race/shared-state/resource-leak cause, that classification was re-examined here and confirmed still correct: the same run's OTHER 16 tests passed within the same timeout window, and a direct, isolated connection attempt with a longer timeout succeeded immediately once the database was warm — consistent with network/cold-start latency, not a race.

A full, dedicated N-times repeated run of the entire suite (as opposed to the specific new/changed tests) was not performed this gate given time constraints — the full regression run (see `gate12-result.md`) was executed once, cleanly, at the end of this gate's work.
