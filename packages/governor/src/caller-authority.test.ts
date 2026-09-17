import { describe, expect, it } from "vitest";
import { bravoLifecycleCallerRequirement, evaluateCallerCompatibility } from "./caller-authority";

describe("bravoLifecycleCallerRequirement", () => {
  it("reports PERMISSIONLESS with source-based evidence, not a bare ABI-visibility claim", () => {
    const result = bravoLifecycleCallerRequirement();
    expect(result.model).toBe("PERMISSIONLESS");
    expect(result.evidence).toMatch(/GovernorBravoDelegate\.sol/);
    expect(result.evidence).toMatch(/require\(msg\.sender/);
  });

  it("evidence explicitly caveats that this is the reference source, not a decompiled specific deployment", () => {
    const result = bravoLifecycleCallerRequirement();
    expect(result.evidence.toLowerCase()).toMatch(/reference/);
  });
});

describe("evaluateCallerCompatibility — per-deployment, empirical (Gate 5 instructions Part 5, §21 tests 16-18)", () => {
  const CALLER = "0xeeCBc82818E591b92e6DD54Aa57589B0B9FeD616" as const;

  it("COMPATIBLE when source matches the reference AND live simulation does not revert (§21 test 16 — permitted caller passes)", () => {
    const result = evaluateCallerCompatibility({
      keeperHubCaller: CALLER,
      deploymentMatchesReferenceSource: true,
      simulation: { success: true, wouldRevert: false },
    });
    expect(result.result).toBe("COMPATIBLE");
  });

  it("BLOCKED_CALLER_NOT_AUTHORIZED when the live simulation reverts, even if the reference source is permissionless — live deployment is authoritative (§21 test 17 — restricted caller blocks)", () => {
    const result = evaluateCallerCompatibility({
      keeperHubCaller: CALLER,
      deploymentMatchesReferenceSource: true,
      simulation: { success: true, wouldRevert: true },
    });
    expect(result.result).toBe("BLOCKED_CALLER_NOT_AUTHORIZED");
  });

  it("BLOCKED_CALLER_NOT_AUTHORIZED when the simulation itself fails", () => {
    const result = evaluateCallerCompatibility({
      keeperHubCaller: CALLER,
      deploymentMatchesReferenceSource: true,
      simulation: { success: false, wouldRevert: false },
    });
    expect(result.result).toBe("BLOCKED_CALLER_NOT_AUTHORIZED");
  });

  it("INCONCLUSIVE when the deployed source could not be confirmed identical to the reference — never silently trusts the reference finding (§21 test 18 — unknown caller semantics blocks)", () => {
    const result = evaluateCallerCompatibility({
      keeperHubCaller: CALLER,
      deploymentMatchesReferenceSource: false,
      simulation: { success: true, wouldRevert: false },
    });
    expect(result.result).toBe("INCONCLUSIVE");
  });

  it("always includes the static requiredCallerModel finding alongside the live result", () => {
    const result = evaluateCallerCompatibility({ keeperHubCaller: CALLER, deploymentMatchesReferenceSource: true, simulation: { success: true, wouldRevert: false } });
    expect(result.requiredCallerModel.model).toBe("PERMISSIONLESS");
  });
});
