import { describe, expect, it } from "vitest";
import type { Hex } from "@marked/core";
import { validateLifecycleExecutionPolicy, buildFrozenCallFromExecutionPlan } from "./lifecycle-execution-policy";
import { BRAVO_LIFECYCLE_CALL_ABI, type BravoExecutionPlan } from "@marked/governor";
import type { FrozenContractCall } from "./types";

const PLAN: BravoExecutionPlan = {
  chainId: 11155111,
  governor: "0x000000000000000000000000000000000000aaa1",
  proposalId: "2",
  functionName: "execute",
  calldata: "0xfe0d94c10000000000000000000000000000000000000000000000000000000000000002",
  value: "0",
  abi: BRAVO_LIFECYCLE_CALL_ABI,
};

const HASH_A: Hex = "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d";
const HASH_B: Hex = "0x0000000000000000000000000000000000000000000000000000000000000099";

function validCall(): FrozenContractCall {
  return buildFrozenCallFromExecutionPlan(PLAN);
}

describe("buildFrozenCallFromExecutionPlan", () => {
  it("targets the Governor with the exact plan calldata/value/chain", () => {
    const call = validCall();
    expect(call.contractAddress).toBe(PLAN.governor);
    expect(call.calldata).toBe(PLAN.calldata);
    expect(call.value).toBe(PLAN.value);
    expect(call.chainId).toBe(PLAN.chainId);
  });
});

describe("validateLifecycleExecutionPolicy — the bounded governance write, exactly (Gate 5 instructions Part 7, §21 tests 19-26)", () => {
  function baseParams() {
    return {
      proposedCall: validCall(),
      expectedPlan: PLAN,
      currentAuthorizationHash: HASH_A,
      commitmentFrozenAuthorizationHash: HASH_A,
    };
  }

  it("valid when the call exactly matches the plan and hashes agree (§21 test 19 — correct Governor passes)", () => {
    expect(validateLifecycleExecutionPolicy(baseParams())).toEqual({ valid: true });
  });

  it("rejects wrong chain", () => {
    const params = baseParams();
    params.proposedCall = { ...params.proposedCall, chainId: 1 };
    const result = validateLifecycleExecutionPolicy(params);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("WRONG_CHAIN");
  });

  it("rejects a call to a different contract than the Governor — this is the check that blocks calling an underlying proposal target directly (§21 test 20/25 — wrong Governor / direct target action rejected)", () => {
    const params = baseParams();
    params.proposedCall = { ...params.proposedCall, contractAddress: "0x000000000000000000000000000000000000dddd" };
    const result = validateLifecycleExecutionPolicy(params);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("WRONG_CONTRACT_ADDRESS");
  });

  it("rejects mismatched calldata — catches wrong proposalId, wrong function, or an inserted extra write (§21 tests 21-23, 26)", () => {
    const params = baseParams();
    params.proposedCall = { ...params.proposedCall, calldata: "0xfe0d94c10000000000000000000000000000000000000000000000000000000000000099" };
    const result = validateLifecycleExecutionPolicy(params);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("WRONG_CALLDATA");
  });

  it("rejects an ERC20-transfer-shaped calldata substituted in place of execute() — still caught as WRONG_CALLDATA", () => {
    const params = baseParams();
    // transfer(address,uint256) selector, unrelated to execute(uint256)
    params.proposedCall = { ...params.proposedCall, calldata: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001" };
    const result = validateLifecycleExecutionPolicy(params);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("WRONG_CALLDATA");
  });

  it("rejects nonzero unexpected value (§21 test 24)", () => {
    const params = baseParams();
    params.proposedCall = { ...params.proposedCall, value: "1000000000000000000" };
    const result = validateLifecycleExecutionPolicy(params);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("WRONG_VALUE");
  });

  it("rejects when the live authorization hash no longer matches the armed commitment's frozen hash (authorization changed mid-flight)", () => {
    const params = baseParams();
    params.currentAuthorizationHash = HASH_B;
    const result = validateLifecycleExecutionPolicy(params);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.code).toBe("AUTHORIZATION_HASH_MISMATCH");
  });

  it("contractAddress comparison is case-insensitive (checksummed vs lowercase must not false-positive as a violation)", () => {
    const params = baseParams();
    params.proposedCall = { ...params.proposedCall, contractAddress: PLAN.governor.toUpperCase().replace("0X", "0x") as `0x${string}` };
    expect(validateLifecycleExecutionPolicy(params)).toEqual({ valid: true });
  });
});
