import { encodeAbiParameters, encodeFunctionData, keccak256 } from "viem";
import type { ChainId, Hex, HexAddress } from "@marked/core";
import { BRAVO_LIFECYCLE_CALL_ABI } from "./bravo-abi";
import type { GovernorProposalCoordinate } from "./resolve";

/**
 * Gate 5 instructions Part 6 — the exact, authority-preserving lifecycle
 * call, built from authoritative Governor semantics only. This is the call
 * KeeperHub must make — never one of the proposal's own underlying target
 * contracts. Deliberately a distinct type/domain from Gate 2's
 * `actionAuthorizationHash` and Gate 4's `frozenActionAuthorizationHash` —
 * this plan is bound to, but never equated with, that hash (Part 6:
 * "Do NOT claim executionCallHash == actionAuthorizationHash").
 */
export type BravoExecutionPlan = {
  chainId: ChainId;
  /** The Governor contract — the only legal call target for this plan. */
  governor: HexAddress;
  proposalId: string;
  functionName: "execute";
  /** Canonical `execute(uint256)` calldata, WITH the 4-byte selector — this is a real top-level EOA/relayer call, not a Bravo-stored inner action (contrast with Gate 2's selector-less `GovernorAuthorizedAction.calldata`). */
  calldata: Hex;
  /** Wei, as a decimal string. Bravo's execute is payable but a proposal-driven lifecycle call conventionally sends 0. */
  value: string;
  abi: typeof BRAVO_LIFECYCLE_CALL_ABI;
};

export function buildBravoExecutionPlan(coordinate: GovernorProposalCoordinate): BravoExecutionPlan {
  const calldata = encodeFunctionData({
    abi: BRAVO_LIFECYCLE_CALL_ABI,
    functionName: "execute",
    args: [BigInt(coordinate.proposalId)],
  });

  return {
    chainId: coordinate.chainId,
    governor: coordinate.governor,
    proposalId: coordinate.proposalId,
    functionName: "execute",
    calldata,
    value: "0",
    abi: BRAVO_LIFECYCLE_CALL_ABI,
  };
}

/**
 * `executionCallHash` — a distinct domain from `actionAuthorizationHash`.
 * Deterministic identity for one execution plan, used only to compare "is
 * this the exact call we planned" — never to re-derive or stand in for
 * Gate 2's action-authorization commitment.
 */
export function computeExecutionCallHash(plan: BravoExecutionPlan): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: "string" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "string" },
      { type: "bytes" },
      { type: "uint256" },
    ],
    ["MARKED_EXECUTION_CALL_V1", BigInt(plan.chainId), plan.governor, BigInt(plan.proposalId), plan.functionName, plan.calldata, BigInt(plan.value)],
  );
  return keccak256(encoded);
}
