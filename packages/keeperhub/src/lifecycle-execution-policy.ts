import type { HexAddress, Hex } from "@marked/core";
import type { BravoExecutionPlan } from "@marked/governor";
import type { FrozenContractCall } from "./types";

/**
 * Gate 5 instructions Part 7 — `WorkflowPolicyValidator`, kept under its
 * PRD name for architectural continuity even though the v1 transport is
 * direct execution (Option B), not a KeeperHub Workflow. Its exact meaning
 * here: prove that a proposed KeeperHub `FrozenContractCall` contains
 * *exactly* the bounded Governor lifecycle write Marked expects, and
 * nothing else — never an underlying proposal target call, never a second
 * write, never a mutated field.
 *
 * Deliberately field-by-field, not a hash-equality shortcut: comparing
 * `contractAddress`/`calldata`/`value`/`chainId` individually means a
 * violation is always reported with a specific, actionable code (Gate 5
 * instructions Part 7's 15 rejection cases collapse to these checks —
 * "wrong Governor" and "underlying proposal target call inserted" are both
 * `WRONG_CONTRACT_ADDRESS`; "ERC20 transfer inserted directly" and "swap
 * inserted directly" are both `WRONG_CALLDATA` once decoded against the
 * expected plan, since the proposed call's target/calldata would name a
 * different contract/function than the Governor's `execute(uint256)`).
 */
export type PolicyViolationCode =
  | "WRONG_CHAIN"
  | "WRONG_CONTRACT_ADDRESS"
  | "WRONG_CALLDATA"
  | "WRONG_VALUE"
  | "AUTHORIZATION_HASH_MISMATCH";

export type PolicyValidationResult = { valid: true } | { valid: false; code: PolicyViolationCode; reason: string };

export function validateLifecycleExecutionPolicy(params: {
  proposedCall: FrozenContractCall;
  expectedPlan: BravoExecutionPlan;
  /** Freshly re-resolved from the live Governor, immediately before this check — see Gate 5 instructions Part 4. */
  currentAuthorizationHash: Hex;
  /** The hash frozen inside the armed FulfillmentCommitment — see Gate 4. */
  commitmentFrozenAuthorizationHash: Hex;
}): PolicyValidationResult {
  const { proposedCall, expectedPlan } = params;

  if (proposedCall.chainId !== expectedPlan.chainId) {
    return { valid: false, code: "WRONG_CHAIN", reason: `Proposed call targets chain ${proposedCall.chainId}, expected ${expectedPlan.chainId}.` };
  }

  if (!sameAddress(proposedCall.contractAddress, expectedPlan.governor)) {
    return {
      valid: false,
      code: "WRONG_CONTRACT_ADDRESS",
      reason: `Proposed call targets ${proposedCall.contractAddress}, expected the Governor (${expectedPlan.governor}). This is the check that rejects any underlying proposal target being called directly (e.g. the ERC20 token, a Comet contract, a proxy) instead of the Governor's own lifecycle entrypoint.`,
    };
  }

  if (proposedCall.calldata.toLowerCase() !== expectedPlan.calldata.toLowerCase()) {
    return {
      valid: false,
      code: "WRONG_CALLDATA",
      reason: `Proposed calldata (${proposedCall.calldata}) does not match the expected execute(${expectedPlan.proposalId}) calldata (${expectedPlan.calldata}). This is the check that rejects a mutated proposalId, a different function selector, or any inserted extra write.`,
    };
  }

  if (proposedCall.value !== expectedPlan.value) {
    return { valid: false, code: "WRONG_VALUE", reason: `Proposed call sends ${proposedCall.value} wei, expected ${expectedPlan.value}.` };
  }

  if (params.currentAuthorizationHash.toLowerCase() !== params.commitmentFrozenAuthorizationHash.toLowerCase()) {
    return {
      valid: false,
      code: "AUTHORIZATION_HASH_MISMATCH",
      reason: `Live Governor authorization (${params.currentAuthorizationHash}) no longer matches the armed commitment's frozen authorization (${params.commitmentFrozenAuthorizationHash}) — refusing to execute against a stale commitment.`,
    };
  }

  return { valid: true };
}

function sameAddress(a: HexAddress, b: HexAddress): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Converts a Governor-side execution plan into the KeeperHub-side frozen call shape it will actually be submitted as. */
export function buildFrozenCallFromExecutionPlan(plan: BravoExecutionPlan): FrozenContractCall {
  return {
    chainId: plan.chainId,
    contractAddress: plan.governor,
    calldata: plan.calldata,
    value: plan.value,
    abi: plan.abi,
  };
}
