import { beforeEach, describe, expect, it } from "vitest";
import type { ArmEvent, FulfillmentCommitment, FulfillmentJob } from "@marked/core";
import type { FulfillmentJobStore } from "./fulfillment-job-store";

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
    jobId: "contract-job-1",
    status: "REVIEW_READY",
    commitment: COMMITMENT,
    fulfillmentCommitmentHash: "0xdeadbeef",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

const ARM_EVENT: ArmEvent = {
  type: "ARMED",
  actor: "operator-1",
  timestamp: "2026-09-17T00:01:00.000Z",
  previousState: "REVIEW_READY",
  nextState: "ARMED",
  fulfillmentCommitmentHash: "0xdeadbeef",
};

/**
 * Gate 11 §18-A — the SAME store-behavior test battery, runnable against
 * any `FulfillmentJobStore` implementation. `SqliteFulfillmentJobStore` and
 * `PostgresFulfillmentJobStore` both pass this identically, which is the
 * actual proof that the abstraction is interchangeable — not merely that
 * two unrelated test suites happen to both be green.
 *
 * `newStore()` must return a store on every call. Against SQLite this is a
 * fresh, empty file per call, which gives every test free isolation. A
 * shared hosted Postgres database has no such isolation (every test hits
 * the SAME tables), so callers that pass one MUST also pass
 * `resetBeforeEach` — a hook that wipes `fulfillment_jobs`, `job_events`,
 * and `execution_claims` before every test. Without it, fixed test ids
 * (e.g. `"contract-job-1"`) and fixed hashes (e.g. `"0xcontracthash"`)
 * leak across tests in the same run AND across repeated runs against the
 * same durable database (Gate 11 hosted-proof finding — see
 * evidence/production-persistence/hosted-production-proof.md).
 *
 * `disposeStore(store)` is called after each test to release the
 * connection/handle. `testTimeout` (ms) lets a real network-backed
 * implementation raise vitest's 5000ms default for genuinely
 * latency-bound round trips without weakening any assertion.
 */
export function runFulfillmentJobStoreContractTests(
  label: string,
  newStore: () => Promise<FulfillmentJobStore>,
  disposeStore: (store: FulfillmentJobStore) => Promise<void>,
  options: { testTimeout?: number; resetBeforeEach?: () => Promise<void> } = {},
) {
  const { testTimeout, resetBeforeEach } = options;

  describe(`FulfillmentJobStore contract — ${label}`, () => {
    if (resetBeforeEach) {
      // vitest's hook timeout is a SEPARATE budget from the test timeout
      // (default 10000ms) — three sequential DELETE round trips against a
      // real network-latency-bound database can exceed it even when
      // `testTimeout` above was already raised (Gate 11 hosted-proof
      // finding). Reuse the same, generous testTimeout for the hook.
      beforeEach(resetBeforeEach, testTimeout);
    }

    it("returns null for a job that was never saved", async () => {
      const store = await newStore();
      try {
        expect(await store.get("nonexistent")).toBeNull();
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("round-trips a saved job exactly", async () => {
      const store = await newStore();
      try {
        await store.save(job());
        expect(await store.get("contract-job-1")).toEqual(job());
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("save overwrites an existing job (upsert)", async () => {
      const store = await newStore();
      try {
        await store.save(job());
        await store.save(job({ status: "ARMED" }));
        expect((await store.get("contract-job-1"))!.status).toBe("ARMED");
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("appendEvents preserves order across multiple calls, and getEvents returns [] for a job with none", async () => {
      const store = await newStore();
      try {
        await store.save(job());
        expect(await store.getEvents("contract-job-1")).toEqual([]);
        for (let i = 0; i < 3; i++) {
          await store.appendEvents("contract-job-1", [{ ...ARM_EVENT, timestamp: `t${i}` }]);
        }
        const events = await store.getEvents("contract-job-1");
        expect(events.map((e) => e.timestamp)).toEqual(["t0", "t1", "t2"]);
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("listJobs returns every saved job, most-recently-updated first", async () => {
      const store = await newStore();
      try {
        await store.save(job({ jobId: "contract-job-a", updatedAt: "2026-09-17T00:00:00.000Z" }));
        await store.save(job({ jobId: "contract-job-b", updatedAt: "2026-09-17T01:00:00.000Z" }));
        const jobs = await store.listJobs();
        expect(jobs.map((j) => j.jobId)).toEqual(["contract-job-b", "contract-job-a"]);
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("saveJobAndEvents persists both halves atomically", async () => {
      const store = await newStore();
      try {
        await store.saveJobAndEvents(job({ status: "ARMED" }), [ARM_EVENT]);
        expect((await store.get("contract-job-1"))?.status).toBe("ARMED");
        expect(await store.getEvents("contract-job-1")).toEqual([ARM_EVENT]);
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("saveWithCas succeeds when expectedCurrentStatus matches, refuses without writing when it doesn't", async () => {
      const store = await newStore();
      try {
        await store.save(job({ status: "REVIEW_READY" }));
        const ok = await store.saveWithCas(job({ status: "ARMED" }), [ARM_EVENT], "REVIEW_READY");
        expect(ok).toEqual({ ok: true });

        const conflict = await store.saveWithCas(job({ status: "DISARMED_BY_USER" }), [], "REVIEW_READY");
        expect(conflict).toEqual({ ok: false, reason: "REVISION_CONFLICT", actualStatus: "ARMED" });
        expect((await store.get("contract-job-1"))?.status).toBe("ARMED");
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("tryClaimExecution: first caller claims, second caller for the same hash is refused and told who holds it", async () => {
      const store = await newStore();
      try {
        const first = await store.tryClaimExecution("0xcontracthash", "contract-job-1", "worker-a");
        expect(first.claimed).toBe(true);
        const second = await store.tryClaimExecution("0xcontracthash", "contract-job-1", "worker-b");
        expect(second).toEqual({ claimed: false, existingClaimJobId: "contract-job-1" });
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("getExecutionClaim reads back a claim by request hash", async () => {
      const store = await newStore();
      try {
        await store.tryClaimExecution("0xcontracthash2", "contract-job-1", "worker-a");
        const claim = await store.getExecutionClaim("0xcontracthash2");
        expect(claim?.jobId).toBe("contract-job-1");
        expect(claim?.actor).toBe("worker-a");
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);

    it("getExecutionClaim returns null for an unclaimed hash", async () => {
      const store = await newStore();
      try {
        expect(await store.getExecutionClaim("0xneverclaimed")).toBeNull();
      } finally {
        await disposeStore(store);
      }
    }, testTimeout);
  });
}
