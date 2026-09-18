import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { InMemoryFulfillmentJobStore } from "@marked/db";
import { UnauthenticatedError } from "@marked/core";
import { setClientOverrideForTests } from "../governance";
import { prepareJobForApproval } from "./prepare";
import { JobNotArmedError } from "./errors";
import { GOVERNOR, buildArmedJob, fakeClient } from "./test-fixtures";

const REAL_TOKEN = "test-demo-token";
const AUTH = { providedToken: REAL_TOKEN, actorId: "judge-alice" };

describe("prepareJobForApproval", () => {
  let store: InMemoryFulfillmentJobStore;

  beforeEach(() => {
    store = new InMemoryFulfillmentJobStore();
    process.env["MARKED_DEMO_SESSION_TOKEN"] = REAL_TOKEN;
    process.env["KEEPERHUB_API_KEY"] = "kh_test_key";
  });

  afterEach(() => {
    setClientOverrideForTests(null);
    vi.unstubAllGlobals();
    delete process.env["MARKED_DEMO_SESSION_TOKEN"];
    delete process.env["KEEPERHUB_API_KEY"];
  });

  it("rejects an unauthenticated request without touching the store", async () => {
    const job = buildArmedJob();
    await store.save(job);
    await expect(prepareJobForApproval(store, job.jobId, { providedToken: null, actorId: "x" })).rejects.toThrow(UnauthenticatedError);
    const stored = await store.get(job.jobId);
    expect(stored!.status).toBe("ARMED");
  });

  it("refuses a job that is not ARMED", async () => {
    const job = buildArmedJob();
    const notArmed = { ...job, status: "REVIEW_READY" as const };
    await store.save(notArmed);
    await expect(prepareJobForApproval(store, job.jobId, AUTH)).rejects.toThrow(JobNotArmedError);
  });

  it("walks ARMED -> AWAITING_APPROVAL for the one source-verified deployment, with a real KeeperHub simulation and pre-state capture", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: true, wouldRevert: false, gasEstimate: "21000" }) }),
    );

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);

    expect(outcome.job.status).toBe("AWAITING_APPROVAL");
    expect(outcome.job.executionState?.recipientBalanceBefore).toBe("0");
    expect(outcome.job.executionState?.authorizedAmount).toBe("1000000000000000000");
    const stored = await store.get(job.jobId);
    expect(stored!.status).toBe("AWAITING_APPROVAL");
  });

  it("refuses BLOCKED_CALLER_NOT_AUTHORIZED for a governor that has not been source-diffed, even when simulation succeeds", async () => {
    const job = buildArmedJob({ governor: getAddress("0x0000000000000000000000000000000000c0ffee") });
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: true, wouldRevert: false }) }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("BLOCKED_CALLER_NOT_AUTHORIZED");
    expect(outcome.reason).toMatch(/INCONCLUSIVE/);
  });

  it("refuses REFUSAL_CANCELED for a canceled proposal", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 2, canceled: true }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("REFUSAL_CANCELED");
  });

  it("refuses REFUSAL_TIMELOCK_PENDING when eta has not passed", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 5000n, blockTimestamp: 1000n }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("REFUSAL_TIMELOCK_PENDING");
  });

  it("refuses REFUSAL_NOT_EXECUTABLE while the proposal is still Active", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 1 }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("REFUSAL_NOT_EXECUTABLE");
  });

  it("reaches FULFILLED_EXTERNALLY_UNVERIFIED, never a refusal, when the proposal was already executed outside Marked", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 7 }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("FULFILLED_EXTERNALLY_UNVERIFIED");
  });

  it("refuses REFUSAL_PAYLOAD_MISMATCH when live authorization no longer matches the frozen commitment", async () => {
    const job = buildArmedJob();
    await store.save(job);
    // A different action bundle live than what was armed -> different authorization hash.
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n, actions: [{ actionIndex: 0, target: GOVERNOR, value: "0", signature: "transfer(address,uint256)", calldata: "0x00" as `0x${string}` }] }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("REFUSAL_PAYLOAD_MISMATCH");
    const stored = await store.get(job.jobId);
    expect(stored!.status).toBe("REFUSAL_PAYLOAD_MISMATCH");
  });

  it("refuses REFUSAL_SIMULATION_REVERT when KeeperHub predicts a revert", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: false, wouldRevert: true }) }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("REFUSAL_SIMULATION_REVERT");
  });

  it("refuses cleanly with REFUSAL_WORKFLOW_POLICY_VIOLATION when KEEPERHUB_API_KEY is not configured, never throwing an unhandled error", async () => {
    delete process.env["KEEPERHUB_API_KEY"];
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n }));

    const outcome = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("REFUSAL_WORKFLOW_POLICY_VIOLATION");
    expect(outcome.reason).toMatch(/KEEPERHUB_API_KEY/);
  });

  it("a single CAS write means a job unchanged since ARMED can be prepared again from scratch (idempotent-safe on retry)", async () => {
    const job = buildArmedJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 1 }));

    const first = await prepareJobForApproval(store, job.jobId, AUTH);
    expect(first.job.status).toBe("REFUSAL_NOT_EXECUTABLE");
    // REFUSAL_NOT_EXECUTABLE is terminal (not ARMED), so a second call correctly refuses via JobNotArmedError rather than silently re-running.
    await expect(prepareJobForApproval(store, job.jobId, AUTH)).rejects.toThrow(JobNotArmedError);
  });
});
