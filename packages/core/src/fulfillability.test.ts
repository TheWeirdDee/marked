import { describe, expect, it } from "vitest";
import { assessFulfillability } from "./fulfillability";

const BASE = {
  governorFamilySupported: true,
  postconditionCoverage: "FULL" as const,
  callerAuthorized: true,
  callerReason: "permissionless",
};

describe("assessFulfillability", () => {
  it("unsupported Governor family fails closed regardless of every other input", () => {
    const result = assessFulfillability({
      ...BASE,
      governorFamilySupported: false,
      eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "eligible" },
    });
    expect(result.outcome).toBe("UNSUPPORTED_AUTHORIZATION");
    expect(result.canArm).toBe(false);
  });

  it("missing eligibility (no read performed) fails closed", () => {
    const result = assessFulfillability({ ...BASE, eligibility: null });
    expect(result.outcome).toBe("UNSUPPORTED_AUTHORIZATION");
    expect(result.canArm).toBe(false);
  });

  it("already executed maps to ALREADY_EXECUTED and never permits arming", () => {
    const result = assessFulfillability({
      ...BASE,
      eligibility: { outcome: "ALREADY_EXECUTED", reason: "Governor reports state Executed." },
    });
    expect(result.outcome).toBe("ALREADY_EXECUTED");
    expect(result.canArm).toBe(false);
  });

  it("canceled maps to CANCELED", () => {
    const result = assessFulfillability({
      ...BASE,
      eligibility: { outcome: "REFUSAL_CANCELED", reason: "Proposal has been canceled." },
    });
    expect(result.outcome).toBe("CANCELED");
    expect(result.canArm).toBe(false);
  });

  it("not executable (defeated/expired/succeeded-not-queued) maps to NOT_EXECUTABLE", () => {
    const result = assessFulfillability({
      ...BASE,
      eligibility: { outcome: "REFUSAL_NOT_EXECUTABLE", reason: "Proposal is Defeated." },
    });
    expect(result.outcome).toBe("NOT_EXECUTABLE");
    expect(result.canArm).toBe(false);
  });

  it("timelock pending maps to WAITING, not a dead end", () => {
    const result = assessFulfillability({
      ...BASE,
      eligibility: { outcome: "REFUSAL_TIMELOCK_PENDING", reason: "eta not passed" },
    });
    expect(result.outcome).toBe("WAITING");
    expect(result.canArm).toBe(false);
  });

  it("eligible but caller not authorized maps to CALLER_BLOCKED, even with FULL coverage", () => {
    const result = assessFulfillability({
      ...BASE,
      callerAuthorized: false,
      callerReason: "simulation reverted",
      eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "eligible" },
    });
    expect(result.outcome).toBe("CALLER_BLOCKED");
    expect(result.canArm).toBe(false);
  });

  it("eligible, caller authorized, but coverage PARTIAL maps to UNSUPPORTED_VERIFICATION", () => {
    const result = assessFulfillability({
      ...BASE,
      postconditionCoverage: "PARTIAL",
      eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "eligible" },
    });
    expect(result.outcome).toBe("UNSUPPORTED_VERIFICATION");
    expect(result.canArm).toBe(false);
  });

  it("eligible, caller authorized, but coverage UNSUPPORTED maps to UNSUPPORTED_VERIFICATION", () => {
    const result = assessFulfillability({
      ...BASE,
      postconditionCoverage: "UNSUPPORTED",
      eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "eligible" },
    });
    expect(result.outcome).toBe("UNSUPPORTED_VERIFICATION");
    expect(result.canArm).toBe(false);
  });

  it("eligible + caller authorized + FULL coverage is the only path to READY, and only READY permits arming", () => {
    const result = assessFulfillability({
      ...BASE,
      eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "eligible" },
    });
    expect(result.outcome).toBe("READY");
    expect(result.canArm).toBe(true);
  });

  it("canArm is false for every outcome except READY (exhaustive check)", () => {
    const outcomes: Array<AssessFulfillabilityParamsFixture> = [
      { ...BASE, governorFamilySupported: false, eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "x" } },
      { ...BASE, eligibility: null },
      { ...BASE, eligibility: { outcome: "ALREADY_EXECUTED", reason: "x" } },
      { ...BASE, eligibility: { outcome: "REFUSAL_CANCELED", reason: "x" } },
      { ...BASE, eligibility: { outcome: "REFUSAL_NOT_EXECUTABLE", reason: "x" } },
      { ...BASE, eligibility: { outcome: "REFUSAL_TIMELOCK_PENDING", reason: "x" } },
      { ...BASE, callerAuthorized: false, eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "x" } },
      { ...BASE, postconditionCoverage: "PARTIAL", eligibility: { outcome: "ELIGIBLE_TO_EXECUTE", reason: "x" } },
    ];
    for (const input of outcomes) {
      expect(assessFulfillability(input).canArm).toBe(false);
    }
  });
});

type AssessFulfillabilityParamsFixture = Parameters<typeof assessFulfillability>[0];
