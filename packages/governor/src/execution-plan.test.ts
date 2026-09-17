import { describe, expect, it } from "vitest";
import { buildBravoExecutionPlan, computeExecutionCallHash } from "./execution-plan";
import { computeActionAuthorizationHash } from "@marked/core";
import type { GovernorProposalCoordinate } from "./resolve";

const COORDINATE: GovernorProposalCoordinate = {
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  proposalId: "220",
};

describe("buildBravoExecutionPlan", () => {
  it("targets the Governor itself, never an underlying proposal action", () => {
    const plan = buildBravoExecutionPlan(COORDINATE);
    expect(plan.governor).toBe(COORDINATE.governor);
    expect(plan.functionName).toBe("execute");
  });

  it("encodes calldata WITH the 4-byte selector (a real top-level call, unlike Bravo's stored inner-action calldata)", () => {
    const plan = buildBravoExecutionPlan(COORDINATE);
    expect(plan.calldata.startsWith("0x")).toBe(true);
    expect(plan.calldata.length).toBeGreaterThan(10); // selector (4 bytes) + encoded uint256 (32 bytes)
  });

  it("sends zero value", () => {
    const plan = buildBravoExecutionPlan(COORDINATE);
    expect(plan.value).toBe("0");
  });

  it("calldata changes when proposalId changes", () => {
    const planA = buildBravoExecutionPlan(COORDINATE);
    const planB = buildBravoExecutionPlan({ ...COORDINATE, proposalId: "221" });
    expect(planA.calldata).not.toBe(planB.calldata);
  });
});

describe("computeExecutionCallHash — distinct domain from actionAuthorizationHash (Gate 5 instructions Part 6)", () => {
  it("is deterministic", () => {
    const plan = buildBravoExecutionPlan(COORDINATE);
    expect(computeExecutionCallHash(plan)).toBe(computeExecutionCallHash(plan));
  });

  it("changes when proposalId changes", () => {
    const planA = buildBravoExecutionPlan(COORDINATE);
    const planB = buildBravoExecutionPlan({ ...COORDINATE, proposalId: "221" });
    expect(computeExecutionCallHash(planA)).not.toBe(computeExecutionCallHash(planB));
  });

  it("changes when governor changes", () => {
    const planA = buildBravoExecutionPlan(COORDINATE);
    const planB = buildBravoExecutionPlan({ ...COORDINATE, governor: "0x0000000000000000000000000000000000000099" });
    expect(computeExecutionCallHash(planA)).not.toBe(computeExecutionCallHash(planB));
  });

  it("never equals a real actionAuthorizationHash for the same coordinate — proving the two domains cannot be confused", () => {
    const plan = buildBravoExecutionPlan(COORDINATE);
    const executionCallHash = computeExecutionCallHash(plan);
    const actionAuthorizationHash = computeActionAuthorizationHash({
      version: 1,
      chainId: COORDINATE.chainId,
      governor: COORDINATE.governor,
      governorFamily: "GOVERNOR_BRAVO",
      proposalId: COORDINATE.proposalId,
      actions: [{ actionIndex: 0, target: "0x0000000000000000000000000000000000000001", value: "0", signature: "", calldata: "0x00" }],
    });
    expect(executionCallHash).not.toBe(actionAuthorizationHash);
  });
});
