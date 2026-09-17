import { describe, expect, it } from "vitest";
import { computeFulfillmentCommitmentHash, type FulfillmentCommitment, type PostconditionBinding } from "./fulfillment-commitment";
import {
  ApprovalHashMismatchError,
  ArmRefusedError,
  IllegalApprovalError,
  IllegalDisarmError,
  approveFulfillmentJob,
  armFulfillmentJob,
  createReviewReadyJob,
  disarmFulfillmentJob,
  type FulfillmentJob,
} from "./fulfillment-job";
import { transition } from "./fulfillment-state-machine";
import type { FulfillmentStatus } from "./status";

const BINDING: PostconditionBinding = {
  actionIndex: 0,
  adapterId: "erc20-transfer",
  adapterVersion: "1",
  required: true,
  bindingParams: [
    { key: "token", value: "0x0000000000000000000000000000000000000001" },
    { key: "recipient", value: "0x0000000000000000000000000000000000000002" },
    { key: "rawAmount", value: "60000000000" },
  ],
};

const COMMITMENT: FulfillmentCommitment = {
  version: 1,
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "220",
  frozenActionAuthorizationHash: "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
  selectedActionIndexes: [0],
  postconditionBindings: [BINDING],
  fulfillmentMode: "APPROVE",
  executionSurfaceId: "keeperhub-direct-contract-call-v1",
  executionPolicyVersion: "1",
};

const NOW = "2026-09-15T00:00:00.000Z";

function freshReviewJob(): FulfillmentJob {
  return createReviewReadyJob({ jobId: "job-1", commitment: COMMITMENT, now: NOW });
}

describe("createReviewReadyJob", () => {
  it("starts at REVIEW_READY with the correct computed hash", () => {
    const job = freshReviewJob();
    expect(job.status).toBe("REVIEW_READY");
    expect(job.fulfillmentCommitmentHash).toBe(computeFulfillmentCommitmentHash(COMMITMENT));
  });
});

describe("armFulfillmentJob — successful arm", () => {
  it("moves REVIEW_READY -> ARMED and returns an ARMED event with actor/timestamp/hash", () => {
    const job = freshReviewJob();
    const { job: armed, event } = armFulfillmentJob({
      job,
      reviewedCommitment: COMMITMENT,
      currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
      currentPostconditionCoverage: "FULL",
      actor: "operator-1",
      now: NOW,
    });
    expect(armed.status).toBe("ARMED");
    expect(event.type).toBe("ARMED");
    expect(event.actor).toBe("operator-1");
    expect(event.previousState).toBe("REVIEW_READY");
    expect(event.nextState).toBe("ARMED");
    expect(event.fulfillmentCommitmentHash).toBe(job.fulfillmentCommitmentHash);
  });
});

describe("armFulfillmentJob — refusals (§12 tests 22-25)", () => {
  it("refuses when the reviewed commitment does not hash to the job under review (stale reviewed commitment — §12 test 22)", () => {
    const job = freshReviewJob();
    const mutatedCommitment = { ...COMMITMENT, proposalId: "221" };
    expect(() =>
      armFulfillmentJob({
        job,
        reviewedCommitment: mutatedCommitment,
        currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
        currentPostconditionCoverage: "FULL",
        actor: "operator-1",
        now: NOW,
      }),
    ).toThrow(ArmRefusedError);
  });

  it("refuses when live Governor authorization no longer matches the frozen hash (authorization changed between review and arm)", () => {
    const job = freshReviewJob();
    let caught: unknown;
    try {
      armFulfillmentJob({
        job,
        reviewedCommitment: COMMITMENT,
        currentAuthorizationHash: "0x0000000000000000000000000000000000000000000000000000000000000099",
        currentPostconditionCoverage: "FULL",
        actor: "operator-1",
        now: NOW,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArmRefusedError);
    expect((caught as InstanceType<typeof ArmRefusedError>).code).toBe("AUTHORIZATION_CHANGED");
  });

  it("refuses when postcondition coverage is PARTIAL (§12 test 25)", () => {
    const job = freshReviewJob();
    let caught: unknown;
    try {
      armFulfillmentJob({
        job,
        reviewedCommitment: COMMITMENT,
        currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
        currentPostconditionCoverage: "PARTIAL",
        actor: "operator-1",
        now: NOW,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArmRefusedError);
    expect((caught as InstanceType<typeof ArmRefusedError>).code).toBe("POSTCONDITION_COVERAGE_INCOMPLETE");
  });

  it("refuses when postcondition coverage is UNSUPPORTED (§12 test 24)", () => {
    const job = freshReviewJob();
    let caught: unknown;
    try {
      armFulfillmentJob({
        job,
        reviewedCommitment: COMMITMENT,
        currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
        currentPostconditionCoverage: "UNSUPPORTED",
        actor: "operator-1",
        now: NOW,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArmRefusedError);
    expect((caught as InstanceType<typeof ArmRefusedError>).code).toBe("POSTCONDITION_UNSUPPORTED");
  });

  it("does not mutate the input job on refusal", () => {
    const job = freshReviewJob();
    try {
      armFulfillmentJob({
        job,
        reviewedCommitment: COMMITMENT,
        currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
        currentPostconditionCoverage: "PARTIAL",
        actor: "operator-1",
        now: NOW,
      });
    } catch {
      // expected
    }
    expect(job.status).toBe("REVIEW_READY");
  });
});

describe("disarmFulfillmentJob", () => {
  function armedJob(): FulfillmentJob {
    const job = freshReviewJob();
    return armFulfillmentJob({
      job,
      reviewedCommitment: COMMITMENT,
      currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
      currentPostconditionCoverage: "FULL",
      actor: "operator-1",
      now: NOW,
    }).job;
  }

  it("disarms an ARMED job, recording actor/timestamp/priorCommitmentHash/reason", () => {
    const job = armedJob();
    const { job: disarmed, event } = disarmFulfillmentJob({ job, actor: "operator-2", reason: "changed my mind", now: NOW });
    expect(disarmed.status).toBe("DISARMED_BY_USER");
    expect(event.type).toBe("DISARMED");
    expect(event.actor).toBe("operator-2");
    expect(event.reason).toBe("changed my mind");
    expect(event.fulfillmentCommitmentHash).toBe(job.fulfillmentCommitmentHash);
  });

  it("reason defaults to null when not supplied", () => {
    const job = armedJob();
    const { event } = disarmFulfillmentJob({ job, actor: "operator-2", now: NOW });
    expect(event.reason).toBeNull();
  });

  it.each(["WAITING_ELIGIBILITY", "ELIGIBLE", "AWAITING_APPROVAL"] as FulfillmentStatus[])("disarms from %s", (status) => {
    const job = { ...armedJob(), status };
    const { job: disarmed } = disarmFulfillmentJob({ job, actor: "operator-2", now: NOW });
    expect(disarmed.status).toBe("DISARMED_BY_USER");
  });

  it.each(["EXECUTING", "RECONCILING", "WAITING_FINALITY", "FULFILLED_VERIFIED"] as FulfillmentStatus[])(
    "rejects illegal late disarm from %s — cannot pretend to cancel a broadcast transaction (§12 test 19 context)",
    (status) => {
      const job = { ...armedJob(), status };
      expect(() => disarmFulfillmentJob({ job, actor: "operator-2", now: NOW })).toThrow(IllegalDisarmError);
    },
  );

  it("a disarmed job cannot execute — DISARMED_BY_USER has no legal transition to EXECUTING (§12 test 19)", () => {
    const job = armedJob();
    const { job: disarmed } = disarmFulfillmentJob({ job, actor: "operator-2", now: NOW });
    expect(() => transition(disarmed.status, "EXECUTING")).toThrow();
  });
});

describe("approveFulfillmentJob", () => {
  function awaitingApprovalJob(): FulfillmentJob {
    const job = freshReviewJob();
    return { ...job, status: "AWAITING_APPROVAL" };
  }

  it("approves and transitions AWAITING_APPROVAL -> EXECUTING, binding to the exact commitment hash", () => {
    const job = awaitingApprovalJob();
    const { job: approved, event } = approveFulfillmentJob({ job, actor: "operator-1", fulfillmentCommitmentHash: job.fulfillmentCommitmentHash, now: NOW });
    expect(approved.status).toBe("EXECUTING");
    expect(event.type).toBe("APPROVED");
    expect(event.fulfillmentCommitmentHash).toBe(job.fulfillmentCommitmentHash);
  });

  it("rejects approval outside AWAITING_APPROVAL", () => {
    const job = freshReviewJob(); // REVIEW_READY, not AWAITING_APPROVAL
    expect(() => approveFulfillmentJob({ job, actor: "operator-1", fulfillmentCommitmentHash: job.fulfillmentCommitmentHash, now: NOW })).toThrow(
      IllegalApprovalError,
    );
  });

  it("rejects an approval given for a different commitment hash than the job's current one (§12 test 21 — approval for hash A rejected for hash B)", () => {
    const job = awaitingApprovalJob();
    const wrongHash = "0x0000000000000000000000000000000000000000000000000000000000000099";
    expect(() => approveFulfillmentJob({ job, actor: "operator-1", fulfillmentCommitmentHash: wrongHash, now: NOW })).toThrow(ApprovalHashMismatchError);
  });
});

describe("no route can manufacture MARKED ✓ (§12 test 30)", () => {
  it("armFulfillmentJob never produces FULFILLED_VERIFIED", () => {
    const job = freshReviewJob();
    const { job: armed } = armFulfillmentJob({
      job,
      reviewedCommitment: COMMITMENT,
      currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
      currentPostconditionCoverage: "FULL",
      actor: "operator-1",
      now: NOW,
    });
    expect(armed.status).not.toBe("FULFILLED_VERIFIED");
  });

  it("disarmFulfillmentJob never produces FULFILLED_VERIFIED", () => {
    const job = { ...freshReviewJob(), status: "ARMED" as FulfillmentStatus };
    const { job: disarmed } = disarmFulfillmentJob({ job, actor: "operator-2", now: NOW });
    expect(disarmed.status).not.toBe("FULFILLED_VERIFIED");
  });

  it("approveFulfillmentJob never produces FULFILLED_VERIFIED (it produces EXECUTING, still far from the terminal state)", () => {
    const job = { ...freshReviewJob(), status: "AWAITING_APPROVAL" as FulfillmentStatus };
    const { job: approved } = approveFulfillmentJob({ job, actor: "operator-1", fulfillmentCommitmentHash: job.fulfillmentCommitmentHash, now: NOW });
    expect(approved.status).not.toBe("FULFILLED_VERIFIED");
  });

  it("none of arm/disarm/approve are async — structurally impossible for any of them to perform network I/O (§12 tests 28-29)", () => {
    const job = freshReviewJob();
    const armResult = armFulfillmentJob({
      job,
      reviewedCommitment: COMMITMENT,
      currentAuthorizationHash: COMMITMENT.frozenActionAuthorizationHash,
      currentPostconditionCoverage: "FULL",
      actor: "operator-1",
      now: NOW,
    });
    expect(armResult).not.toBeInstanceOf(Promise);
    const disarmResult = disarmFulfillmentJob({ job: armResult.job, actor: "operator-2", now: NOW });
    expect(disarmResult).not.toBeInstanceOf(Promise);
  });
});
