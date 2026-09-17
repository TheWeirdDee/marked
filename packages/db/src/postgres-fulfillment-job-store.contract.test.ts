import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, it } from "vitest";
import postgres from "postgres";
import { PostgresFulfillmentJobStore } from "./postgres-fulfillment-job-store";
import { runFulfillmentJobStoreContractTests } from "./fulfillment-job-store.contract";

/**
 * Gate 11 §18-A/§19 — proves PostgresFulfillmentJobStore against the exact
 * same contract battery `sqlite-fulfillment-job-store.contract.test.ts`
 * runs against SqliteFulfillmentJobStore.
 *
 * This file does NOT invent, mock, or fake a Postgres connection. It reads
 * `DATABASE_URL` from the environment; if unset, or set but unreachable
 * (no local/hosted Postgres is configured in this environment as of this
 * gate — see evidence/production-persistence/current-storage-audit.md and
 * gate11-result.md), every test in this file is explicitly marked SKIPPED
 * with the reason, never silently passed and never silently deleted. A
 * skipped test run is not a passing proof of hosted persistence — see
 * VERCEL_ENVIRONMENT.md and DECISIONS.md for what is required to actually
 * exercise this suite.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env["DATABASE_URL"];

/**
 * Real hosted Postgres round trips run 3-4s each (Neon, network-bound —
 * see evidence/production-persistence/hosted-production-proof.md), and
 * several of these tests are two or more sequential round trips. Vitest's
 * 5000ms default timeout is a tooling limit, not a correctness bound;
 * this raises it for this file only. SQLite's contract test file is
 * unaffected — its round trips are sub-millisecond.
 */
const LIVE_TEST_TIMEOUT_MS = 20_000;

async function probeAndMigrate(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 15s, not 5s: a hosted Neon compute that scaled to zero needs real wake-up
  // time on the first connection of a run — a tight probe timeout here was
  // observed to produce a false SKIPPED verdict against a genuinely reachable
  // database (Gate 11 hosted-proof finding), not a correctness signal.
  const sql = postgres(url, { max: 1, ssl: "require", connect_timeout: 15 });
  try {
    await sql`SELECT 1`;
    const migrationSql = readFileSync(join(__dirname, "..", "migrations", "0001_init.sql"), "utf8");
    await sql.unsafe(migrationSql);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const probe = DATABASE_URL ? await probeAndMigrate(DATABASE_URL) : ({ ok: false, reason: "DATABASE_URL is not set" } as const);

if (probe.ok && DATABASE_URL) {
  // A dedicated connection just for wiping the shared tables between tests
  // (Gate 11 hosted-proof finding: fixed contract ids/hashes leak across
  // tests, and across repeated runs, against a real persistent database —
  // SQLite never surfaced this because every `newStore()` call there gets
  // a brand-new temp file). No FKs in this schema, so order doesn't matter.
  const adminSql = postgres(DATABASE_URL, { max: 1, ssl: "require", connect_timeout: 15 });
  afterAll(async () => {
    await adminSql.end({ timeout: 1 });
  });

  runFulfillmentJobStoreContractTests(
    "PostgresFulfillmentJobStore (live)",
    async () => new PostgresFulfillmentJobStore(DATABASE_URL),
    async (store) => {
      await store.close();
    },
    {
      testTimeout: LIVE_TEST_TIMEOUT_MS,
      resetBeforeEach: async () => {
        await adminSql`DELETE FROM job_events`;
        await adminSql`DELETE FROM execution_claims`;
        await adminSql`DELETE FROM fulfillment_jobs`;
      },
    },
  );
} else {
  const reason = probe.ok ? "" : probe.reason;
  describe("FulfillmentJobStore contract — PostgresFulfillmentJobStore", () => {
    it.skip(`SKIPPED — no reachable/migratable Postgres in this environment (${reason}). This is NOT a passing proof of hosted persistence — see evidence/production-persistence/gate11-result.md and VERCEL_ENVIRONMENT.md for exactly what DATABASE_URL value is required to run this suite for real.`, () => {
      // intentionally empty — the skip reason is the point
    });
  });
}
