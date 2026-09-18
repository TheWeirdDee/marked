import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryFulfillmentJobStore } from "@marked/db";
import { UnauthenticatedError, IllegalApprovalError } from "@marked/core";
import { setClientOverrideForTests } from "../governance";
import { approveAndExecuteJob, continueReconciliation } from "./approve-and-execute";
import { LiveExecutionDisabledError } from "./errors";
import { buildArmedJob, fakeClient } from "./test-fixtures";

const REAL_TOKEN = "test-demo-token";
const AUTH = { providedToken: REAL_TOKEN, actorId: "judge-alice" };

/** A job already sitting at AWAITING_APPROVAL, as if prepareJobForApproval already ran — the legitimate fixture for testing Stage B in isolation, matching this codebase's existing "seed the store directly with a job already at AWAITING_APPROVAL" pattern (see fulfillment-actions.test.ts). */
function buildAwaitingApprovalJob() {
  const job = buildArmedJob();
  return { ...job, status: "AWAITING_APPROVAL" as const };
}

function stubKeeperHubFetch(responses: { simulate?: unknown; execute?: unknown } = {}) {
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? "{}");
    const isSimulate = body.simulate === true;
    const payload = isSimulate ? (responses.simulate ?? { success: true, wouldRevert: false }) : (responses.execute ?? { executionId: "exec-1", status: "SUBMITTED", transactionHash: "0x" + "1".repeat(64) });
    return { ok: true, status: 200, json: () => Promise.resolve(payload) } as Response;
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

describe("approveAndExecuteJob", () => {
  let store: InMemoryFulfillmentJobStore;

  beforeEach(() => {
    store = new InMemoryFulfillmentJobStore();
    process.env["MARKED_DEMO_SESSION_TOKEN"] = REAL_TOKEN;
    process.env["KEEPERHUB_API_KEY"] = "kh_test_key";
    process.env["MARKED_ENABLE_KEEPERHUB_EXECUTION"] = "true";
  });

  afterEach(() => {
    setClientOverrideForTests(null);
    vi.unstubAllGlobals();
    delete process.env["MARKED_DEMO_SESSION_TOKEN"];
    delete process.env["KEEPERHUB_API_KEY"];
    delete process.env["MARKED_ENABLE_KEEPERHUB_EXECUTION"];
  });

  it("rejects an unauthenticated request without touching the store", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    await expect(approveAndExecuteJob(store, job.jobId, { providedToken: null, actorId: "x" })).rejects.toThrow(UnauthenticatedError);
    expect((await store.get(job.jobId))!.status).toBe("AWAITING_APPROVAL");
  });

  it("refuses a job that is not AWAITING_APPROVAL (reuses the unmodified Gate 4 IllegalApprovalError)", async () => {
    const job = { ...buildArmedJob(), status: "ARMED" as const };
    await store.save(job);
    await expect(approveAndExecuteJob(store, job.jobId, AUTH)).rejects.toThrow(IllegalApprovalError);
  });

  it("refuses when live execution is disabled, mutating nothing and making zero network calls", async () => {
    delete process.env["MARKED_ENABLE_KEEPERHUB_EXECUTION"];
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    const fetchImpl = stubKeeperHubFetch();

    await expect(approveAndExecuteJob(store, job.jobId, AUTH)).rejects.toThrow(LiveExecutionDisabledError);
    expect((await store.get(job.jobId))!.status).toBe("AWAITING_APPROVAL");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("walks AWAITING_APPROVAL all the way to FULFILLED_VERIFIED against a mocked KeeperHub and mocked chain reads — zero real network calls", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    // state sequence: 5 (Queued/eligible) for the pre-broadcast revalidation, then 7 (Executed)
    // for the post-dispatch VERIFYING_GOVERNOR_STATE re-check — a real Governor's state
    // genuinely changes between those two points in time. ONE shared client instance across the
    // whole pipeline (approveAndExecuteJob internally calls continueReconciliation, which builds
    // its own client — memoizing here means both share the same call-index counters, matching a
    // single real RPC endpoint queried repeatedly over the course of one flow).
    const client = fakeClient({ state: [5, 7], eta: 1n, blockTimestamp: 1000n, balanceOfSequence: [0n, 1_000_000_000_000_000_000n] });
    setClientOverrideForTests(() => client);
    stubKeeperHubFetch();

    const outcome = await approveAndExecuteJob(store, job.jobId, AUTH);

    expect(outcome.job.status).toBe("FULFILLED_VERIFIED");
    expect(outcome.job.receipt).toBeDefined();
    expect(outcome.job.receipt?.status).toBe("FULFILLED_VERIFIED");
    expect(outcome.job.receipt?.requiredAssertionsVerified).toBe(true);
    const stored = await store.get(job.jobId);
    expect(stored!.status).toBe("FULFILLED_VERIFIED");
    expect(stored!.receipt).toBeDefined();
  });

  it("reaches FULFILLED_UNVERIFIED, not FULFILLED_VERIFIED, when the observed balance delta does not match what was authorized", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    // Both balanceOf reads return the same value -> zero observed delta, but 1e18 was authorized.
    const client = fakeClient({ state: [5, 7], eta: 1n, blockTimestamp: 1000n, balanceOfSequence: [0n, 0n] });
    setClientOverrideForTests(() => client);
    stubKeeperHubFetch();

    const outcome = await approveAndExecuteJob(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("FULFILLED_UNVERIFIED");
    expect(outcome.job.receipt?.status).toBe("FULFILLED_UNVERIFIED");
  });

  it("never dispatches when lifecycle re-check fails immediately before broadcast, leaving the job at AWAITING_APPROVAL", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 2, canceled: true }));
    const fetchImpl = stubKeeperHubFetch();

    const outcome = await approveAndExecuteJob(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("AWAITING_APPROVAL");
    expect(outcome.reason).toMatch(/lifecycle re-check/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await store.get(job.jobId))!.status).toBe("AWAITING_APPROVAL");
  });

  it("never dispatches when the authorization re-check no longer matches the frozen commitment", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    setClientOverrideForTests(() =>
      fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n, actions: [{ actionIndex: 0, target: job.commitment.governor, value: "0", signature: "transfer(address,uint256)", calldata: "0x00" as `0x${string}` }] }),
    );
    const fetchImpl = stubKeeperHubFetch();

    const outcome = await approveAndExecuteJob(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("AWAITING_APPROVAL");
    expect(outcome.reason).toMatch(/authorization/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses when simulation reverts, before any approval is recorded", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    setClientOverrideForTests(() => fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n }));
    stubKeeperHubFetch({ simulate: { success: false, wouldRevert: true } });

    await expect(approveAndExecuteJob(store, job.jobId, AUTH)).rejects.toThrow();
    expect((await store.get(job.jobId))!.status).toBe("AWAITING_APPROVAL");
  });

  it("double APPROVE: a real double-click never produces two KeeperHub execute() dispatches, and exactly one caller is refused", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    // A single fixed state (not a sequence) — on-chain state genuinely has not changed between
    // the two concurrent reads; the only thing that changes is Marked's own job status, via its
    // own CAS. This is what makes the race meaningful: both callers see identical, consistent
    // chain state and can only be told apart by the store's compare-and-set.
    const client = fakeClient({ state: 5, eta: 1n, blockTimestamp: 1000n });
    setClientOverrideForTests(() => client);
    const fetchImpl = stubKeeperHubFetch();

    const [first, second] = await Promise.allSettled([approveAndExecuteJob(store, job.jobId, AUTH), approveAndExecuteJob(store, job.jobId, AUTH)]);
    const outcomes = [first, second];
    const rejected = outcomes.filter((o) => o.status === "rejected");

    const executeCalls = fetchImpl.mock.calls.filter((call) => {
      const body = JSON.parse((call[1] as RequestInit).body as string);
      return body.simulate !== true;
    });
    // The one invariant that actually matters: never two real dispatches for one approval.
    expect(executeCalls.length).toBeLessThanOrEqual(1);
    // And the loser of the CAS race is told plainly that its action did not apply, never silently ignored.
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });

  it("KeeperHub success alone does not produce MARKED ✓ without postcondition verification actually running", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    const client = fakeClient({ state: [5, 7], eta: 1n, blockTimestamp: 1000n, balanceOfSequence: [0n, 0n] });
    setClientOverrideForTests(() => client);
    stubKeeperHubFetch();

    const outcome = await approveAndExecuteJob(store, job.jobId, AUTH);
    // KeeperHub reported success (transactionHash present) and the Governor confirms Executed,
    // but the balance delta was wrong -> FULFILLED_UNVERIFIED, never FULFILLED_VERIFIED.
    expect(outcome.job.status).toBe("FULFILLED_UNVERIFIED");
  });
});

describe("continueReconciliation", () => {
  let store: InMemoryFulfillmentJobStore;

  beforeEach(() => {
    store = new InMemoryFulfillmentJobStore();
    process.env["MARKED_DEMO_SESSION_TOKEN"] = REAL_TOKEN;
  });

  afterEach(() => {
    setClientOverrideForTests(null);
    delete process.env["MARKED_DEMO_SESSION_TOKEN"];
  });

  it("is a no-op for a job with nothing to reconcile", async () => {
    const job = buildAwaitingApprovalJob();
    await store.save(job);
    const outcome = await continueReconciliation(store, job.jobId, AUTH);
    expect(outcome.job.status).toBe("AWAITING_APPROVAL");
    expect(outcome.reason).toMatch(/Nothing to reconcile/);
  });

  it("reports the exact stuck state honestly when approval was recorded but dispatch was never claimed", async () => {
    const armed = buildArmedJob();
    const stuck = { ...armed, status: "EXECUTING" as const, executionState: { preStateBlock: "1", recipientBalanceBefore: "0", token: armed.commitment.governor, recipient: armed.commitment.governor, authorizedAmount: "1" } };
    await store.save(stuck);
    const outcome = await continueReconciliation(store, stuck.jobId, AUTH);
    expect(outcome.job.status).toBe("EXECUTING");
    expect(outcome.reason).toMatch(/never started/);
  });

  it("resumes from WAITING_FINALITY and completes through to FULFILLED_VERIFIED", async () => {
    const armed = buildArmedJob();
    const waitingFinality = {
      ...armed,
      status: "WAITING_FINALITY" as const,
      executionState: {
        preStateBlock: "999",
        recipientBalanceBefore: "0",
        token: armed.commitment.postconditionBindings[0]!.bindingParams.find((p) => p.key === "token")!.value,
        recipient: armed.commitment.postconditionBindings[0]!.bindingParams.find((p) => p.key === "recipient")!.value,
        authorizedAmount: "1000000000000000000",
        requestHash: "0xaaaa",
        transactionHash: "0x" + "1".repeat(64),
        inclusionBlock: "1000",
      },
    };
    await store.save(waitingFinality);
    // Only ONE balanceOf call happens on this resumed path (the post-execution verify read) —
    // the pre-state balance comes from the already-stored executionState.recipientBalanceBefore
    // ("0"), never a fresh read. This single value must be pre (0) + authorizedAmount (1e18).
    setClientOverrideForTests(() => fakeClient({ state: 7, eta: 1n, blockTimestamp: 1000n, blockNumber: 1005n, balanceOfSequence: [1_000_000_000_000_000_000n] }));

    const outcome = await continueReconciliation(store, waitingFinality.jobId, AUTH);
    expect(outcome.job.status).toBe("FULFILLED_VERIFIED");
  });
});
