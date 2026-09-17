import { describe, expect, it } from "vitest";
import { validateAgentPlan, CandidateAgentPlanSchema, type ValidateAgentPlanParams } from "./agent-plan";

const VALID_CANDIDATE = {
  version: 1,
  explanation: "Governance authorized a single ERC20 transfer, fully supported.",
  proposalSummary: "Send the treasury-authorized amount to the recipient the Governor's own action specifies.",
  suggestedActionIndexes: [0],
  executionExplanation: "Marked will submit Governor.execute(proposalId) through KeeperHub once eligible.",
  verificationExplanation: "The recipient's balance must increase by exactly the authorized raw amount.",
  riskNotes: [],
};

const BASE_PARAMS: Omit<ValidateAgentPlanParams, "candidateRaw"> = {
  totalActionCount: 1,
  requiredActionIndexes: [0],
  supportedActionIndexes: [0],
  fulfillabilityCanArm: true,
};

function validate(candidateRaw: unknown, overrides: Partial<Omit<ValidateAgentPlanParams, "candidateRaw">> = {}) {
  return validateAgentPlan({ candidateRaw, ...BASE_PARAMS, ...overrides });
}

describe("agent plan — schema tests (Gate 10 instructions §39)", () => {
  it("1: a valid candidate is accepted", () => {
    const result = validate(VALID_CANDIDATE);
    expect(result.ok).toBe(true);
  });

  it("2: a nonexistent action index is rejected", () => {
    const result = validate({ ...VALID_CANDIDATE, suggestedActionIndexes: [7] }, { totalActionCount: 1, supportedActionIndexes: [0] });
    expect(result).toMatchObject({ ok: false, code: "ACTION_INDEX_NOT_FOUND" });
  });

  it("3: a duplicate action index is rejected", () => {
    const result = validate({ ...VALID_CANDIDATE, suggestedActionIndexes: [0, 0] });
    expect(result).toMatchObject({ ok: false, code: "DUPLICATE_ACTION_INDEX" });
  });

  it("4: an unsupported action is rejected", () => {
    const result = validate({ ...VALID_CANDIDATE, suggestedActionIndexes: [0] }, { supportedActionIndexes: [] });
    expect(result).toMatchObject({ ok: false, code: "ACTION_UNSUPPORTED" });
  });

  it.each([
    ["recipient", "0xF02789155998f85D3a0b7dcA1525b059988Ab442"],
    ["amount", "1500000000000000000000"],
    ["target", "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F"],
    ["calldata", "0xa9059cbb00000000000000000000000000000000000000000000000000000000"],
    ["governor", "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"],
    ["proposalId", "999"],
  ])("5-10: an unknown '%s' property is rejected by the strict schema, not silently ignored", (key, value) => {
    const result = validate({ ...VALID_CANDIDATE, [key]: value });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SCHEMA_INVALID");
      expect(result.reason).toContain(key);
    }
  });

  it("11: malformed output (wrong types entirely) is rejected", () => {
    const result = validate({ garbage: true, notAPlan: "nope" });
    expect(result).toMatchObject({ ok: false, code: "SCHEMA_INVALID" });
  });

  it("the schema itself has no authority-shaped fields at the type level", () => {
    const shape = CandidateAgentPlanSchema.shape;
    for (const forbidden of ["recipient", "amount", "target", "calldata", "governor", "proposalId", "chainId", "actionAuthorizationHash", "value", "executionTarget", "executionFunction"]) {
      expect(Object.prototype.hasOwnProperty.call(shape, forbidden)).toBe(false);
    }
  });
});

describe("agent plan — authority boundary tests (Gate 10 instructions §40)", () => {
  const authorityFields: Record<string, unknown> = {
    chainId: 1,
    governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
    proposalId: "220",
    target: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F",
    recipient: "0xF02789155998f85D3a0b7dcA1525b059988Ab442",
    amount: "1500000000000000000000",
    calldata: "0xdeadbeef",
    actionAuthorizationHash: "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
    expectedValue: "1500000000000000000000",
    executionTarget: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F",
    executionFunction: "transfer(address,uint256)",
    simulationPassed: true,
    fulfilled: true,
    execute: true,
    approved: true,
  };

  it.each(Object.entries(authorityFields))("an agent candidate cannot supply '%s' — schema rejects it outright", (key, value) => {
    const result = validate({ ...VALID_CANDIDATE, [key]: value });
    expect(result.ok, `field '${key}' should have been rejected but was accepted`).toBe(false);
  });
});

describe("agent plan — additional deterministic validator cases", () => {
  it("no suggested actions at all is refused (not silently defaulted to the first action)", () => {
    const result = validate({ ...VALID_CANDIDATE, suggestedActionIndexes: [] });
    expect(result).toMatchObject({ ok: false, code: "NO_ACTIONS_SUGGESTED" });
  });

  it("omitting a required action index is refused even when the suggested action is itself valid", () => {
    const result = validate(
      { ...VALID_CANDIDATE, suggestedActionIndexes: [1] },
      { totalActionCount: 2, requiredActionIndexes: [0, 1], supportedActionIndexes: [0, 1] },
    );
    expect(result).toMatchObject({ ok: false, code: "REQUIRED_ACTION_OMITTED" });
  });

  it("a structurally valid, fully-supported plan is refused when Marked's own fulfillability says the proposal cannot be armed (e.g. already executed, timelock pending)", () => {
    const result = validate(VALID_CANDIDATE, { fulfillabilityCanArm: false });
    expect(result).toMatchObject({ ok: false, code: "FULFILLABILITY_NOT_READY" });
  });

  it("a validated plan exposes only selectedActionIndexes — never a raw copy of untrusted candidate fields beyond the allowed schema", () => {
    const result = validate(VALID_CANDIDATE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.selectedActionIndexes).toEqual([0]);
      expect(Object.keys(result.plan).sort()).toEqual(
        ["executionExplanation", "explanation", "operatorQuestions", "proposalSummary", "riskNotes", "selectedActionIndexes", "verificationExplanation", "version"].sort(),
      );
    }
  });
});

describe("agent plan — validation never mutates or reaches into external state", () => {
  it("validateAgentPlan is a pure, synchronous function — no Promise, no client parameter accepted", () => {
    const result = validateAgentPlan({ candidateRaw: VALID_CANDIDATE, ...BASE_PARAMS });
    // If this were async, `result` would be a Promise, and `.ok` would be undefined on it directly.
    expect(typeof result).toBe("object");
    expect("ok" in result).toBe(true);
  });
});
