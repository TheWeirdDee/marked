import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ArmEvent, FulfillmentCommitment, FulfillmentJob } from "@marked/core";
import { SqliteFulfillmentJobStore } from "./sqlite-fulfillment-job-store";

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

function job(overrides: Partial<FulfillmentJob> = {}): FulfillmentJob {
  return {
    jobId: "job-1",
    status: "REVIEW_READY",
    commitment: COMMITMENT,
    fulfillmentCommitmentHash: "0xdeadbeef",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

const ARM_EVENT: ArmEvent = {
  type: "ARMED",
  actor: "operator-1",
  timestamp: "2026-09-16T00:01:00.000Z",
  previousState: "REVIEW_READY",
  nextState: "ARMED",
  fulfillmentCommitmentHash: "0xdeadbeef",
};

const tmpDirs: string[] = [];
function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "marked-sqlite-test-"));
  tmpDirs.push(dir);
  return join(dir, "test.db");
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe("SqliteFulfillmentJobStore — basic save/get (real file-backed database)", () => {
  it("round-trips a saved job", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    await store.save(job());
    expect(await store.get("job-1")).toEqual(job());
    store.close();
  });

  it("returns null for a job that was never saved", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    expect(await store.get("nonexistent")).toBeNull();
    store.close();
  });

  it("save overwrites an existing job (upsert)", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    await store.save(job());
    await store.save(job({ status: "ARMED" }));
    expect((await store.get("job-1"))!.status).toBe("ARMED");
    store.close();
  });
});

describe("SqliteFulfillmentJobStore — restart survival (Gate 7 instructions §A/§B, §26 tests 1-2)", () => {
  it("a job persisted in one process instance is readable from a brand-new instance pointed at the same file (simulated restart)", async () => {
    const dbPath = tmpDbPath();
    const before = new SqliteFulfillmentJobStore(dbPath);
    await before.save(job({ status: "ARMED" }));
    await before.appendEvents("job-1", [ARM_EVENT]);
    before.close();

    // Simulate a process restart: a completely new store instance, same file.
    const after = new SqliteFulfillmentJobStore(dbPath);
    const reloaded = await after.get("job-1");
    expect(reloaded?.status).toBe("ARMED");
    expect(await after.getEvents("job-1")).toEqual([ARM_EVENT]);
    after.close();
  });

  it("an execution claim persisted before a crash is still visible after restart (execution identity survives reload, §26 test 2)", async () => {
    const dbPath = tmpDbPath();
    const before = new SqliteFulfillmentJobStore(dbPath);
    before.tryClaimExecution("0xrequesthash", "job-1", "gate7-worker-a");
    before.close();

    const after = new SqliteFulfillmentJobStore(dbPath);
    const claim = after.getExecutionClaim("0xrequesthash");
    expect(claim?.jobId).toBe("job-1");
    expect(claim?.actor).toBe("gate7-worker-a");
    after.close();
  });
});

describe("SqliteFulfillmentJobStore — append-only event history", () => {
  it("event order is preserved exactly as appended, across multiple appendEvents calls", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    await store.save(job());
    for (let i = 0; i < 5; i++) {
      await store.appendEvents("job-1", [{ ...ARM_EVENT, timestamp: `t${i}` }]);
    }
    const events = await store.getEvents("job-1");
    expect(events.map((e) => e.timestamp)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    store.close();
  });

  it("exposes no update/delete method for events", () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    expect((store as unknown as Record<string, unknown>)["updateEvents"]).toBeUndefined();
    expect((store as unknown as Record<string, unknown>)["deleteEvents"]).toBeUndefined();
    store.close();
  });
});

describe("SqliteFulfillmentJobStore.tryClaimExecution — duplicate-worker protection via real compare-and-set (Gate 7 instructions §I, §26 test 10)", () => {
  it("the first worker to claim a request hash succeeds", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    const result = store.tryClaimExecution("0xrequesthash", "job-1", "worker-a");
    expect(result.claimed).toBe(true);
    store.close();
  });

  it("a second worker claiming the SAME request hash is refused, and told who already claimed it", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    store.tryClaimExecution("0xrequesthash", "job-1", "worker-a");
    const second = store.tryClaimExecution("0xrequesthash", "job-1", "worker-b");
    expect(second.claimed).toBe(false);
    expect(second.existingClaimJobId).toBe("job-1");
    store.close();
  });

  it("two DIFFERENT request hashes (e.g. different jobs) do not collide", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    const a = store.tryClaimExecution("0xhashA", "job-1", "worker-a");
    const b = store.tryClaimExecution("0xhashB", "job-2", "worker-a");
    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(true);
    store.close();
  });

  it("simulates two concurrent workers racing for the same job: only one logical execution proceeds", async () => {
    const dbPath = tmpDbPath();
    const storeA = new SqliteFulfillmentJobStore(dbPath);
    const storeB = new SqliteFulfillmentJobStore(dbPath); // a second "worker" connected to the same durable file
    const claimA = storeA.tryClaimExecution("0xsharedrequest", "job-1", "worker-a");
    const claimB = storeB.tryClaimExecution("0xsharedrequest", "job-1", "worker-b");
    const claimedCount = [claimA, claimB].filter((c) => c.claimed).length;
    expect(claimedCount).toBe(1);
    storeA.close();
    storeB.close();
  });
});

describe("SqliteFulfillmentJobStore — listJobs", () => {
  it("returns an empty list for a fresh database", async () => {
    const store = new SqliteFulfillmentJobStore(tmpDbPath());
    expect(await store.listJobs()).toEqual([]);
    store.close();
  });

  it("returns every saved job, most-recently-updated first, surviving a restart", async () => {
    const dbPath = tmpDbPath();
    const store = new SqliteFulfillmentJobStore(dbPath);
    await store.save(job({ jobId: "job-1", updatedAt: "2026-09-16T00:00:00.000Z" }));
    await store.save(job({ jobId: "job-2", updatedAt: "2026-09-16T01:00:00.000Z" }));
    store.close();

    const reopened = new SqliteFulfillmentJobStore(dbPath);
    const jobs = await reopened.listJobs();
    expect(jobs.map((j) => j.jobId)).toEqual(["job-2", "job-1"]);
    reopened.close();
  });
});
