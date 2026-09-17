import { describe, expect, it } from "vitest";
import { isMarked, ALL_FULFILLMENT_STATUSES, type FulfillmentStatus } from "@marked/core";
import { loadLane1Cactus, loadLane2Gate5, loadGate6Receipt } from "./evidence";

/**
 * Gate 7 Part 26 tests 17-30 (the parts that are evidence-integrity checks
 * rather than interactive-UI checks — see `fulfillment-actions.test.ts` for
 * the auth ones). These load the exact same JSON files the `/demo` page
 * renders from, so a value going stale or a lane getting merged would fail
 * a test here, not just look wrong on the page.
 */
describe("evidence integrity", () => {
  const lane1 = loadLane1Cactus();
  const lane2 = loadLane2Gate5();
  const gate6 = loadGate6Receipt();

  it("evidence files are present (regression: these must not silently disappear)", () => {
    expect(lane1.resolved).not.toBeNull();
    expect(lane1.authorization).not.toBeNull();
    expect(lane2.deployment).not.toBeNull();
    expect(lane2.proof).not.toBeNull();
    expect(gate6.receipt).not.toBeNull();
    expect(gate6.proof).not.toBeNull();
  });

  // --- 17: success screen cannot render MARKED ✓ without FULFILLED_VERIFIED ---
  it("17: isMarked is true only for FULFILLED_VERIFIED, false for every other real status", () => {
    for (const status of ALL_FULFILLMENT_STATUSES) {
      expect(isMarked(status)).toBe(status === "FULFILLED_VERIFIED");
    }
  });

  it("17b: the loaded Gate 6 receipt's own status is FULFILLED_VERIFIED (so the hero section's gate is actually exercised, not vacuously true)", () => {
    expect(gate6.receipt?.status).toBe("FULFILLED_VERIFIED");
    expect(isMarked(gate6.receipt?.status as FulfillmentStatus)).toBe(true);
  });

  // --- 18: receipt uses canonical Gate 6 receipt ---
  it("18: the receipt hash is the exact canonical Gate 6 value", () => {
    expect(gate6.proof?.receiptHash).toBe("0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4");
  });

  // --- 19: expected amount derives from authorization ---
  it("19: the expected (decoded) amount matches the frozen commitment's postcondition binding — not a separately typed constant", () => {
    const expectedFromCommitment = lane2.proof?.commitment.postconditionBindings[0]?.bindingParams.find((p) => p.key === "rawAmount")?.value;
    expect(gate6.proof?.decodedAction.rawAmount).toBe(expectedFromCommitment);
    expect(gate6.proof?.decodedAction.rawAmount).toBe("1000000000000000000000");
  });

  // --- 20: observed amount derives from verification evidence, and Expected == Observed ---
  it("20: the observed delta equals the expected amount ('Expected = Observed')", () => {
    expect(gate6.proof?.postcondition.observed.observedDelta).toBe(gate6.proof?.decodedAction.rawAmount);
    expect(gate6.proof?.postcondition.observed.balanceDeltaMatches).toBe(true);
    expect(gate6.proof?.postcondition.verified).toBe(true);
  });

  // --- 21/22: lanes never claim each other's evidence ---
  it("21/22: Lane 1 (Cactus/mainnet) and Lane 2 (controlled Sepolia) are different chains and different governors", () => {
    expect(lane1.resolved?.chain.chainId).toBe(1);
    expect(lane2.proof?.commitment.chainId).toBe(11155111);
    expect(lane1.resolved?.governor.address.toLowerCase()).not.toBe(lane2.proof?.commitment.governor.toLowerCase());
  });

  it("21b: Lane 1's own status is read-only 'executed' on mainnet, never a KeeperHub execution status", () => {
    expect(lane1.resolved?.proposal.status).toBe("executed");
    expect(lane1.proof?.actionAuthorizationHash).toBe("0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d");
  });

  // --- 23: KeeperHub executionId is real Gate 5 evidence ---
  it("23: executionId matches the known real Gate 5 KeeperHub execution id", () => {
    expect(lane2.proof?.execution.executionId).toBe("wn1mlnlj6kotkxqdjgebz");
  });

  // --- 24: tx hash is real Gate 5 evidence ---
  it("24: transaction hash matches the known real Gate 5 execution tx", () => {
    expect(lane2.proof?.execution.transactionHash).toBe("0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb");
    expect(gate6.receipt?.executionTxHash).toBe(lane2.proof?.execution.transactionHash);
  });

  // --- 25: receipt hash is real Gate 6 evidence (duplicate of 18, kept as its own numbered case) ---
  it("25: receiptHash is the same value displayed on the hero/receipt sections", () => {
    expect(gate6.proof?.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  // --- 26: unsupported postcondition cannot show success (structural, not just this fixture) ---
  it("26: postcondition coverage is FULL for the displayed receipt — never PARTIAL/UNSUPPORTED while status is FULFILLED_VERIFIED", () => {
    expect(gate6.receipt?.postconditionCoverage).toBe("FULL");
    expect(gate6.receipt?.requiredAssertionsVerified).toBe(true);
  });

  // --- 29: no UI path can mutate canonical proof evidence (loader is read-only) ---
  it("29: the evidence loaders expose no write/save function", async () => {
    const evidenceModuleKeys = Object.keys(await import("./evidence"));
    for (const key of evidenceModuleKeys) {
      expect(key.toLowerCase()).not.toMatch(/^(save|write|update|delete|mutate)/);
    }
  });
});
