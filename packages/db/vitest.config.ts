import { defineConfig } from "vitest/config";

/**
 * Gate 11 hosted-proof finding: `postgres-fulfillment-job-store.contract.test.ts`
 * and `postgres-fulfillment-job-store.hosted.test.ts` both exercise the SAME
 * real, shared hosted Postgres tables (unlike every SQLite test, which gets
 * its own fresh temp-file database). Vitest runs test files in parallel by
 * default, so without this, one file's per-test table wipe can race another
 * file's in-flight insert/read against the real database — a genuine
 * cross-file isolation bug, not a flaky test. Forcing sequential file
 * execution costs a few seconds on this small package and makes every test
 * here deterministic against the real hosted database.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    // Real hosted-Postgres round trips run several seconds each (Neon,
    // network-bound) — vitest's default 10000ms hook timeout is a tooling
    // limit, not a correctness bound (Gate 11 hosted-proof finding).
    hookTimeout: 20_000,
  },
});
