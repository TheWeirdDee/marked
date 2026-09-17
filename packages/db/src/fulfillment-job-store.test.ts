import { describe, expect, it } from "vitest";
import type { ArmEvent, FulfillmentCommitment, FulfillmentJob, FulfillmentJobEvent } from "@marked/core";
import { InMemoryFulfillmentJobStore } from "./fulfillment-job-store";

const COMMITMENT: FulfillmentCommitment = {
  version: 1,
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "220",
  frozenActionAuthorizationHash: "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
  selectedActionIndexes: [0],
  postconditionBindings: [],
  fulfillmentMode: "APPROVE",
  executionSurfaceId: "keeperhub-direct-contract-call-v1",
  executionPolicyVersion: "1",
};

const JOB: FulfillmentJob = {
  jobId: "job-1",
  status: "REVIEW_READY",
  commitment: COMMITMENT,
  fulfillmentCommitmentHash: "0xdeadbeef",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

const ARM_EVENT: ArmEvent = {
  type: "ARMED",
  actor: "operator-1",
  timestamp: "2026-09-15T00:01:00.000Z",
  previousState: "REVIEW_READY",
  nextState: "ARMED",
  fulfillmentCommitmentHash: "0xdeadbeef",
};

describe("InMemoryFulfillmentJobStore — basic save/get", () => {
  it("returns null for a job that was never saved", async () => {
    const store = new InMemoryFulfillmentJobStore();
    expect(await store.get("nonexistent")).toBeNull();
  });

  it("round-trips a saved job exactly", async () => {
    const store = new InMemoryFulfillmentJobStore();
    await store.save(JOB);
    const loaded = await store.get("job-1");
    expect(loaded).toEqual(JOB);
  });

  it("save with a new status overwrites the job record (not the events)", async () => {
    const store = new InMemoryFulfillmentJobStore();
    await store.save(JOB);
    const armed: FulfillmentJob = { ...JOB, status: "ARMED", updatedAt: "2026-09-15T00:01:00.000Z" };
    await store.save(armed);
    const loaded = await store.get("job-1");
    expect(loaded!.status).toBe("ARMED");
  });
});

describe("InMemoryFulfillmentJobStore — append-only event history (§11, §12 test 27)", () => {
  it("getEvents returns an empty array for a job with no events yet", async () => {
    const store = new InMemoryFulfillmentJobStore();
    await store.save(JOB);
    expect(await store.getEvents("job-1")).toEqual([]);
  });

  it("appendEvents adds to the history without touching prior entries", async () => {
    const store = new InMemoryFulfillmentJobStore();
    await store.save(JOB);
    await store.appendEvents("job-1", [ARM_EVENT]);
    const secondEvent: FulfillmentJobEvent = { ...ARM_EVENT, type: "APPROVED", timestamp: "2026-09-15T00:02:00.000Z", previousState: "AWAITING_APPROVAL", nextState: "EXECUTING" };
    await store.appendEvents("job-1", [secondEvent]);
    const events = await store.getEvents("job-1");
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(ARM_EVENT);
    expect(events[1]).toEqual(secondEvent);
  });

  it("event order is preserved exactly as appended", async () => {
    const store = new InMemoryFulfillmentJobStore();
    await store.save(JOB);
    for (let i = 0; i < 5; i++) {
      await store.appendEvents("job-1", [{ ...ARM_EVENT, timestamp: `t${i}` }]);
    }
    const events = await store.getEvents("job-1");
    expect(events.map((e) => e.timestamp)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("the store interface exposes no update or delete method for events", () => {
    const store = new InMemoryFulfillmentJobStore();
    expect((store as unknown as Record<string, unknown>)["updateEvents"]).toBeUndefined();
    expect((store as unknown as Record<string, unknown>)["deleteEvents"]).toBeUndefined();
    expect((store as unknown as Record<string, unknown>)["clearEvents"]).toBeUndefined();
  });
});

describe("InMemoryFulfillmentJobStore — restart/reload preserves the exact commitment (§10, §12 test 26)", () => {
  it("a snapshot round-tripped into a brand-new store instance preserves the job and its full event history byte-for-byte", async () => {
    const original = new InMemoryFulfillmentJobStore();
    await original.save(JOB);
    await original.appendEvents("job-1", [ARM_EVENT]);

    const snapshot = original.exportSnapshot();

    // Simulate a process restart: a completely new store instance, rehydrated only from the snapshot.
    const restarted = InMemoryFulfillmentJobStore.fromSnapshot(snapshot);

    expect(await restarted.get("job-1")).toEqual(JOB);
    expect(await restarted.getEvents("job-1")).toEqual([ARM_EVENT]);
  });

  it("the frozen commitment and its hash survive the restart round-trip unchanged", async () => {
    const original = new InMemoryFulfillmentJobStore();
    await original.save(JOB);
    const restarted = InMemoryFulfillmentJobStore.fromSnapshot(original.exportSnapshot());
    const loaded = await restarted.get("job-1");
    expect(loaded!.commitment).toEqual(COMMITMENT);
    expect(loaded!.fulfillmentCommitmentHash).toBe(JOB.fulfillmentCommitmentHash);
  });

  it("mutating the restarted store does not affect the original (independent instances, not shared references)", async () => {
    const original = new InMemoryFulfillmentJobStore();
    await original.save(JOB);
    const restarted = InMemoryFulfillmentJobStore.fromSnapshot(original.exportSnapshot());
    await restarted.save({ ...JOB, status: "ARMED" });
    expect((await original.get("job-1"))!.status).toBe("REVIEW_READY");
    expect((await restarted.get("job-1"))!.status).toBe("ARMED");
  });
});

describe("InMemoryFulfillmentJobStore — listJobs", () => {
  it("returns an empty list for a fresh store", async () => {
    const store = new InMemoryFulfillmentJobStore();
    expect(await store.listJobs()).toEqual([]);
  });

  it("returns every saved job, most-recently-updated first", async () => {
    const store = new InMemoryFulfillmentJobStore();
    await store.save({ ...JOB, jobId: "job-1", updatedAt: "2026-09-15T00:00:00.000Z" });
    await store.save({ ...JOB, jobId: "job-2", updatedAt: "2026-09-16T00:00:00.000Z" });
    const jobs = await store.listJobs();
    expect(jobs.map((j) => j.jobId)).toEqual(["job-2", "job-1"]);
  });
});
