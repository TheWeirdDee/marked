import { describe, expect, it } from "vitest";
import { computeReceiptHash, reconcileForMarkedReceipt, type MarkedReceipt, type ReconciliationInput } from "./receipt";

const HASH_A = "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d" as const;
const HASH_B = "0x0000000000000000000000000000000000000000000000000000000000000099" as const;

const RECEIPT: MarkedReceipt = {
  version: 1,
  fulfillmentCommitmentHash: HASH_A,
  frozenActionAuthorizationHash: HASH_A,
  finalGovernorAuthorizationHash: HASH_A,
  chainId: 11155111,
  governor: "0xE86cdC53f3C4f416BE42F13f621be96AB9d30727",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "2",
  actionIndex: 0,
  executionTxHash: "0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb",
  executionBlock: "11716393",
  finalityBlock: "11716395",
  governorFinalState: 7,
  postconditionCoverage: "FULL",
  requiredAssertionsVerified: true,
  status: "FULFILLED_VERIFIED",
  observedAt: "2026-09-16T00:00:00.000Z",
};

describe("computeReceiptHash — determinism", () => {
  it("is deterministic across repeated calls", () => {
    expect(computeReceiptHash(RECEIPT)).toBe(computeReceiptHash(RECEIPT));
  });

  it("is unaffected by observedAt — a timestamp annotation, not an attested fact", () => {
    const other = { ...RECEIPT, observedAt: "2030-01-01T00:00:00.000Z" };
    expect(computeReceiptHash(other)).toBe(computeReceiptHash(RECEIPT));
  });

  it("is unaffected by JS object key order", () => {
    const reordered = {
      status: RECEIPT.status,
      requiredAssertionsVerified: RECEIPT.requiredAssertionsVerified,
      postconditionCoverage: RECEIPT.postconditionCoverage,
      governorFinalState: RECEIPT.governorFinalState,
      finalityBlock: RECEIPT.finalityBlock,
      executionBlock: RECEIPT.executionBlock,
      executionTxHash: RECEIPT.executionTxHash,
      actionIndex: RECEIPT.actionIndex,
      proposalId: RECEIPT.proposalId,
      governorFamily: RECEIPT.governorFamily,
      governor: RECEIPT.governor,
      chainId: RECEIPT.chainId,
      finalGovernorAuthorizationHash: RECEIPT.finalGovernorAuthorizationHash,
      frozenActionAuthorizationHash: RECEIPT.frozenActionAuthorizationHash,
      fulfillmentCommitmentHash: RECEIPT.fulfillmentCommitmentHash,
      version: RECEIPT.version,
      observedAt: RECEIPT.observedAt,
    } as MarkedReceipt;
    expect(computeReceiptHash(reordered)).toBe(computeReceiptHash(RECEIPT));
  });
});

describe("computeReceiptHash — mutation sensitivity", () => {
  const base = computeReceiptHash(RECEIPT);

  it("changes when frozenActionAuthorizationHash changes", () => {
    expect(computeReceiptHash({ ...RECEIPT, frozenActionAuthorizationHash: HASH_B })).not.toBe(base);
  });

  it("changes when executionTxHash changes", () => {
    expect(computeReceiptHash({ ...RECEIPT, executionTxHash: HASH_B })).not.toBe(base);
  });

  it("changes when governorFinalState changes", () => {
    expect(computeReceiptHash({ ...RECEIPT, governorFinalState: 5 })).not.toBe(base);
  });

  it("changes when status changes (FULFILLED_VERIFIED vs FULFILLED_UNVERIFIED)", () => {
    expect(computeReceiptHash({ ...RECEIPT, status: "FULFILLED_UNVERIFIED" })).not.toBe(base);
  });

  it("changes when postconditionCoverage changes", () => {
    expect(computeReceiptHash({ ...RECEIPT, postconditionCoverage: "PARTIAL" })).not.toBe(base);
  });

  it("changes when actionIndex changes", () => {
    expect(computeReceiptHash({ ...RECEIPT, actionIndex: 1 })).not.toBe(base);
  });
});

describe("reconcileForMarkedReceipt — the core terminal invariant (Gate 6 instructions §2)", () => {
  function validInput(): ReconciliationInput {
    return {
      frozenActionAuthorizationHash: HASH_A,
      authorizationHashAtExecution: HASH_A,
      finalAuthorizationHash: HASH_A,
      selectedActionIndex: 0,
      postconditionBindingActionIndex: 0,
      governorFinalState: 7,
      requiredGovernorExecutedState: 7,
      postconditionCoverage: "FULL",
      requiredAssertionsVerified: true,
    };
  }

  it("verified when every leg agrees", () => {
    expect(reconcileForMarkedReceipt(validInput())).toEqual({ verified: true });
  });

  it("KeeperHub 'completed' / receipt success alone cannot mark — a mismatched authorization at execution still refuses", () => {
    const input = validInput();
    input.authorizationHashAtExecution = HASH_B;
    const result = reconcileForMarkedReceipt(input);
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.code).toBe("AUTHORIZATION_MISMATCH");
  });

  it("refuses when the freshly re-resolved authorization no longer matches the frozen hash", () => {
    const input = validInput();
    input.finalAuthorizationHash = HASH_B;
    const result = reconcileForMarkedReceipt(input);
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.code).toBe("AUTHORIZATION_MISMATCH");
  });

  it("refuses when the selected action index does not correspond to the postcondition binding", () => {
    const input = validInput();
    input.postconditionBindingActionIndex = 1;
    const result = reconcileForMarkedReceipt(input);
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.code).toBe("ACTION_INDEX_MISMATCH");
  });

  it("Governor.state == Executed alone cannot mark — a non-Executed state refuses regardless of other fields", () => {
    const input = validInput();
    input.governorFinalState = 5; // Queued
    const result = reconcileForMarkedReceipt(input);
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.code).toBe("GOVERNOR_NOT_EXECUTED");
  });

  it("refuses on PARTIAL postcondition coverage even with everything else agreeing", () => {
    const input = validInput();
    input.postconditionCoverage = "PARTIAL";
    const result = reconcileForMarkedReceipt(input);
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.code).toBe("POSTCONDITION_COVERAGE_INCOMPLETE");
  });

  it("a Transfer-event-exists signal alone cannot mark — FULL coverage with an unverified required assertion still refuses", () => {
    const input = validInput();
    input.requiredAssertionsVerified = false;
    const result = reconcileForMarkedReceipt(input);
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.code).toBe("POSTCONDITION_NOT_VERIFIED");
  });
});
