import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import type { ArmEvent, FulfillmentCommitment, FulfillmentJob } from "@marked/core";
import { PostgresFulfillmentJobStore } from "./postgres-fulfillment-job-store";

/**
 * Gate 11 §18-B/§18-C/§18-D/§18-E, run for real against the hosted
 * database — the same properties `sqlite-fulfillment-job-store.test.ts`
 * proves for SQLite (concurrent-worker races, transaction rollback,
 * restart survival), proven here against a real Postgres engine instead
 * of merely inferred from the shared contract suite passing.
 *
 * Same skip discipline as postgres-fulfillment-job-store.contract.test.ts:
 * no DATABASE_URL (or an unreachable one) means every test here is
 * explicitly `it.skip`, never silently passed.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env["DATABASE_URL"];
const LIVE_TEST_TIMEOUT_MS = 20_000;

const COMMITMENT: FulfillmentCommitment = {
  version: 1,
  chainId: 11155111,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "2",
  frozenActionAuthorizationHash: "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
  selectedActionIndexes: [0],
  postconditionBindings: [],
  fulfillmentMode: "APPROVE",
  executionSurfaceId: "keeperhub-direct-contract-call-v1",
  executionPolicyVersion: "1",
};

function job(jobId: string, overrides: Partial<FulfillmentJob> = {}): FulfillmentJob {
  return {
    jobId,
    status: "REVIEW_READY",
    commitment: COMMITMENT,
    fulfillmentCommitmentHash: "0xdeadbeef",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function armEvent(overrides: Partial<ArmEvent> = {}): ArmEvent {
  return {
    type: "ARMED",
    actor: "operator-1",
    timestamp: "2026-09-17T00:01:00.000Z",
    previousState: "REVIEW_READY",
    nextState: "ARMED",
    fulfillmentCommitmentHash: "0xdeadbeef",
    ...overrides,
  };
}

/** A fresh, unique id per test — this file exercises a real shared database with no per-test truncation, so ids must never collide across tests or across repeated runs. */
function uniqueJobId(label: string): string {
  return `hosted-${label}-${randomUUID()}`;
}

async function probeAndMigrate(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 15s — see the matching comment in postgres-fulfillment-job-store.contract.test.ts.
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
  const url = DATABASE_URL;
  const createdJobIds: string[] = [];
  const createdHashes: string[] = [];
  const adminSql = postgres(url, { max: 1, ssl: "require", connect_timeout: 15 });

  afterAll(async () => {
    await adminSql.end({ timeout: 1 });
  });

  beforeEach(() => {
    createdJobIds.length = 0;
    createdHashes.length = 0;
  });

  describe("PostgresFulfillmentJobStore — restart/reconnect survival against the real hosted database (Gate 11 §18-C)", () => {
    it(
      "a job persisted by one store instance is readable from a brand-new instance pointed at the same DATABASE_URL",
      async () => {
        const jobId = uniqueJobId("restart");
        const before = new PostgresFulfillmentJobStore(url);
        await before.save(job(jobId, { status: "ARMED" }));
        await before.appendEvents(jobId, [armEvent()]);
        await before.close();

        // A brand-new connection, standing in for a brand-new serverless invocation / process restart.
        const after = new PostgresFulfillmentJobStore(url);
        const reloaded = await after.get(jobId);
        expect(reloaded?.status).toBe("ARMED");
        expect(await after.getEvents(jobId)).toEqual([armEvent()]);
        await after.close();

        await adminSql`DELETE FROM job_events WHERE job_id = ${jobId}`;
        await adminSql`DELETE FROM fulfillment_jobs WHERE job_id = ${jobId}`;
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "an execution claim persisted before a crash is still visible after reconnect",
      async () => {
        const jobId = uniqueJobId("claim-restart");
        const hash = `0x${randomUUID().replace(/-/g, "")}`;
        const before = new PostgresFulfillmentJobStore(url);
        await before.tryClaimExecution(hash, jobId, "gate11-worker-a");
        await before.close();

        const after = new PostgresFulfillmentJobStore(url);
        const claim = await after.getExecutionClaim(hash);
        expect(claim?.jobId).toBe(jobId);
        expect(claim?.actor).toBe("gate11-worker-a");
        await after.close();

        await adminSql`DELETE FROM execution_claims WHERE request_hash = ${hash}`;
      },
      LIVE_TEST_TIMEOUT_MS,
    );
  });

  describe("PostgresFulfillmentJobStore — concurrent workers against the real hosted database (Gate 11 §18-B, mandatory)", () => {
    it(
      "two workers racing tryClaimExecution for the SAME request hash: exactly one claims",
      async () => {
        const jobId = uniqueJobId("claim-race");
        const hash = `0x${randomUUID().replace(/-/g, "")}`;
        const storeA = new PostgresFulfillmentJobStore(url);
        const storeB = new PostgresFulfillmentJobStore(url);

        const [claimA, claimB] = await Promise.all([storeA.tryClaimExecution(hash, jobId, "worker-a"), storeB.tryClaimExecution(hash, jobId, "worker-b")]);
        const claimedCount = [claimA, claimB].filter((c) => c.claimed).length;
        expect(claimedCount).toBe(1);

        await storeA.close();
        await storeB.close();
        await adminSql`DELETE FROM execution_claims WHERE request_hash = ${hash}`;
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "two workers racing saveWithCas against the same expected status: exactly one succeeds",
      async () => {
        const jobId = uniqueJobId("cas-race");
        const storeA = new PostgresFulfillmentJobStore(url);
        const storeB = new PostgresFulfillmentJobStore(url);
        await storeA.save(job(jobId, { status: "REVIEW_READY" }));

        const [resultA, resultB] = await Promise.all([
          storeA.saveWithCas(job(jobId, { status: "ARMED" }), [armEvent()], "REVIEW_READY"),
          storeB.saveWithCas(job(jobId, { status: "DISARMED_BY_USER" }), [], "REVIEW_READY"),
        ]);
        const successCount = [resultA, resultB].filter((r) => r.ok).length;
        expect(successCount).toBe(1);

        await storeA.close();
        await storeB.close();
        await adminSql`DELETE FROM job_events WHERE job_id = ${jobId}`;
        await adminSql`DELETE FROM fulfillment_jobs WHERE job_id = ${jobId}`;
      },
      LIVE_TEST_TIMEOUT_MS,
    );
  });

  describe("PostgresFulfillmentJobStore — transaction rollback against the real hosted database (Gate 11 §18-D, mandatory)", () => {
    it(
      "saveJobAndEvents: a real failure appending the event rolls back the job write too — neither persists",
      async () => {
        const jobId = uniqueJobId("rollback-save");
        const store = new PostgresFulfillmentJobStore(url);
        // A BigInt field makes JSON.stringify throw INSIDE the open transaction,
        // after the job INSERT has already executed but before COMMIT — a real
        // failure point, not a simulated one (same technique as the SQLite proof).
        const unserializableEvent = { ...armEvent(), poisoned: 1n } as unknown as ArmEvent;

        await expect(store.saveJobAndEvents(job(jobId, { status: "ARMED" }), [unserializableEvent])).rejects.toThrow();

        expect(await store.get(jobId)).toBeNull();
        expect(await store.getEvents(jobId)).toEqual([]);
        await store.close();
      },
      LIVE_TEST_TIMEOUT_MS,
    );

    it(
      "saveWithCas: a real failure appending the event rolls back the CAS job write too — the pre-existing job is untouched",
      async () => {
        const jobId = uniqueJobId("rollback-cas");
        const store = new PostgresFulfillmentJobStore(url);
        await store.save(job(jobId, { status: "REVIEW_READY" }));
        const unserializableEvent = { ...armEvent(), poisoned: 1n } as unknown as ArmEvent;

        await expect(store.saveWithCas(job(jobId, { status: "ARMED" }), [unserializableEvent], "REVIEW_READY")).rejects.toThrow();

        expect((await store.get(jobId))?.status).toBe("REVIEW_READY");
        expect(await store.getEvents(jobId)).toEqual([]);
        await store.close();
        await adminSql`DELETE FROM fulfillment_jobs WHERE job_id = ${jobId}`;
      },
      LIVE_TEST_TIMEOUT_MS,
    );
  });

  describe("PostgresFulfillmentJobStore — JSONB serialization round-trip against the real hosted database (Gate 11 §18-E)", () => {
    it(
      "unicode, nested structures, and special characters survive a real round trip through JSONB",
      async () => {
        const jobId = uniqueJobId("serialization");
        const store = new PostgresFulfillmentJobStore(url);
        const tricky = job(jobId, {
          status: "ARMED",
          // deliberately awkward for naive string handling: unicode, quotes,
          // backslashes, newlines, and a nested/array-shaped commitment field.
          fulfillmentCommitmentHash: "0x\"quoted\"\\backslash\nnewline-\u00e9\u4e2d\u6587-emoji-\ud83d\ude80",
        });
        await store.save(tricky);
        const reloaded = await store.get(jobId);
        expect(reloaded).toEqual(tricky);

        const trickyEvent = armEvent({ actor: "operator-\u00e9\u4e2d\u6587-\"quoted\"-\\slash\\-\nnewline" });
        await store.appendEvents(jobId, [trickyEvent]);
        const events = await store.getEvents(jobId);
        expect(events).toEqual([trickyEvent]);

        await store.close();
        await adminSql`DELETE FROM job_events WHERE job_id = ${jobId}`;
        await adminSql`DELETE FROM fulfillment_jobs WHERE job_id = ${jobId}`;
      },
      LIVE_TEST_TIMEOUT_MS,
    );
  });
} else {
  const reason = probe.ok ? "" : probe.reason;
  describe("PostgresFulfillmentJobStore — hosted atomicity/concurrency/rollback/restart proof", () => {
    it.skip(`SKIPPED — no reachable/migratable Postgres in this environment (${reason}). See evidence/production-persistence/gate11-result.md and VERCEL_ENVIRONMENT.md.`, () => {
      // intentionally empty — the skip reason is the point
    });
  });
}
