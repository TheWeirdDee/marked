import { describe, expect, it } from "vitest";
import {
  classifyRestartRecovery,
  classifyExecutionRecovery,
  classifyExternalExecutionRecovery,
  classifyFinalityRegression,
  resolveDuplicateWorkerOutcome,
} from "./recovery";
import type { FulfillmentJob } from "./fulfillment-job";
import type { FulfillmentCommitment } from "./fulfillment-commitment";
import type { FulfillmentStatus } from "./status";

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

function jobAt(status: FulfillmentStatus): FulfillmentJob {
  return { jobId: "job-1", status, commitment: COMMITMENT, fulfillmentCommitmentHash: "0xdeadbeef", createdAt: "t0", updatedAt: "t0" };
}

describe("classifyRestartRecovery — Scenario A: crash before submission (§26 test 1)", () => {
  it.each(["NEW", "ARMED", "WAITING_ELIGIBILITY", "SIMULATING", "AWAITING_APPROVAL"] as FulfillmentStatus[])("%s is safe to resume — no KeeperHub call could have been made yet", (status) => {
    const result = classifyRestartRecovery(jobAt(status));
    expect(result.safeToResume).toBe(true);
  });

  it.each(["EXECUTING", "RECONCILING", "WAITING_FINALITY", "GOVERNOR_EXECUTION_CONFIRMED"] as FulfillmentStatus[])("%s is NOT safe to blindly resume — a KeeperHub call may already be in flight", (status) => {
    const result = classifyRestartRecovery(jobAt(status));
    expect(result.safeToResume).toBe(false);
  });
});

describe("classifyExecutionRecovery — Scenarios B/C/D: never resubmit (§26 tests 3-4)", () => {
  it("Scenario B — crash after submit, tx hash known but receipt not yet confirmed: RECONCILING, never resubmit", () => {
    const result = classifyExecutionRecovery({ hasPersistedExecutionIdentity: true, keeperHubStatus: "completed", hasTransactionHash: true, hasConfirmedReceipt: false });
    expect(result.status).toBe("RECONCILING");
    expect(result.mayResubmit).toBe(false);
  });

  it("Scenario B continued — receipt confirmed: proceeds to WAITING_FINALITY, never resubmit", () => {
    const result = classifyExecutionRecovery({ hasPersistedExecutionIdentity: true, keeperHubStatus: "completed", hasTransactionHash: true, hasConfirmedReceipt: true });
    expect(result.status).toBe("WAITING_FINALITY");
    expect(result.mayResubmit).toBe(false);
  });

  it("Scenario C — KeeperHub timeout (status unknown, no tx hash): UNKNOWN_RECONCILING, never resubmit", () => {
    const result = classifyExecutionRecovery({ hasPersistedExecutionIdentity: true, keeperHubStatus: "unknown", hasTransactionHash: false, hasConfirmedReceipt: false });
    expect(result.status).toBe("UNKNOWN_RECONCILING");
    expect(result.mayResubmit).toBe(false);
  });

  it("Scenario D — KeeperHub says completed but no tx hash/receipt known yet: remains UNKNOWN_RECONCILING, does not mark", () => {
    const result = classifyExecutionRecovery({ hasPersistedExecutionIdentity: true, keeperHubStatus: "completed", hasTransactionHash: false, hasConfirmedReceipt: false });
    expect(result.status).toBe("UNKNOWN_RECONCILING");
    expect(result.mayResubmit).toBe(false);
  });

  it("no persisted execution identity at all: fails closed to UNKNOWN_RECONCILING rather than resubmitting", () => {
    const result = classifyExecutionRecovery({ hasPersistedExecutionIdentity: false, keeperHubStatus: null, hasTransactionHash: false, hasConfirmedReceipt: false });
    expect(result.status).toBe("UNKNOWN_RECONCILING");
    expect(result.mayResubmit).toBe(false);
  });

  it("the return type structurally has no 'resubmit' outcome — mayResubmit is always false", () => {
    const scenarios: Parameters<typeof classifyExecutionRecovery>[0][] = [
      { hasPersistedExecutionIdentity: true, keeperHubStatus: "completed", hasTransactionHash: true, hasConfirmedReceipt: true },
      { hasPersistedExecutionIdentity: true, keeperHubStatus: "pending", hasTransactionHash: false, hasConfirmedReceipt: false },
      { hasPersistedExecutionIdentity: false, keeperHubStatus: null, hasTransactionHash: false, hasConfirmedReceipt: false },
    ];
    for (const s of scenarios) {
      expect(classifyExecutionRecovery(s).mayResubmit).toBe(false);
    }
  });
});

describe("classifyExternalExecutionRecovery — Scenario F: external execution while offline (§26 test 7)", () => {
  it("Governor already Executed, execution tx known: does not call KeeperHub, proceeds to verification", () => {
    const result = classifyExternalExecutionRecovery({ eligibilityOutcome: "ALREADY_EXECUTED", knownExecutionTxHash: "0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb" });
    expect(result.callKeeperHub).toBe(false);
    expect(result.proceedToVerification).toBe(true);
  });

  it("Governor already Executed, no execution tx known: does not call KeeperHub, does not guess a transaction to verify", () => {
    const result = classifyExternalExecutionRecovery({ eligibilityOutcome: "ALREADY_EXECUTED", knownExecutionTxHash: null });
    expect(result.callKeeperHub).toBe(false);
    expect(result.proceedToVerification).toBe(false);
  });
});

describe("classifyFinalityRegression — Scenario H: reorg before finality (§26 test 9)", () => {
  const OBSERVED = "0xee91df6d214a8263abd0cd678c9d612b44bd0c61fa4747a3846f0daad37f0d8c" as const;

  it("unchanged block hash: finality holds", () => {
    const result = classifyFinalityRegression({ previouslyObservedBlockHash: OBSERVED, currentBlockHashAtSameHeight: OBSERVED });
    expect(result.reorged).toBe(false);
    expect(result.action).toBe("FINALITY_HOLDS");
  });

  it("changed block hash at the same height: reorg detected, reverts to RECONCILING", () => {
    const result = classifyFinalityRegression({ previouslyObservedBlockHash: OBSERVED, currentBlockHashAtSameHeight: "0x0000000000000000000000000000000000000000000000000000000000000099" });
    expect(result.reorged).toBe(true);
    expect(result.action).toBe("REVERT_TO_RECONCILING");
  });

  it("block no longer retrievable at that height: treated as a reorg, fails closed", () => {
    const result = classifyFinalityRegression({ previouslyObservedBlockHash: OBSERVED, currentBlockHashAtSameHeight: null });
    expect(result.reorged).toBe(true);
    expect(result.action).toBe("REVERT_TO_RECONCILING");
  });

  it("never preserves a premature success — a reorg always reverts, regardless of how the previous observation was labeled", () => {
    const result = classifyFinalityRegression({ previouslyObservedBlockHash: OBSERVED, currentBlockHashAtSameHeight: "0x0000000000000000000000000000000000000000000000000000000000000001" });
    expect(result.action).not.toBe("FINALITY_HOLDS");
  });
});

describe("resolveDuplicateWorkerOutcome — Scenario I: duplicate worker (§26 test 10)", () => {
  it("a successful claim proceeds", () => {
    expect(resolveDuplicateWorkerOutcome({ claimed: true })).toBe("PROCEED");
  });

  it("a failed claim (another worker already holds it) suppresses", () => {
    expect(resolveDuplicateWorkerOutcome({ claimed: false })).toBe("SUPPRESS_DUPLICATE");
  });
});
