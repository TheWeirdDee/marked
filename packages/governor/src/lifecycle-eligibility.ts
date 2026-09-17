import type { PublicClient } from "viem";
import type { HexAddress } from "@marked/core";
import { BRAVO_STATE_ABI, BRAVO_PROPOSALS_ABI, bravoStateLabel } from "./bravo-abi";
import { GovernorResolutionError } from "./errors";

/**
 * Gate 5 — deterministic lifecycle eligibility, from authoritative onchain
 * state only. Never inferred from Cactus labels, proposal prose, or an LLM
 * (Gate 5 instructions Part 3). Scoped to "is this proposal ready for the
 * `execute(proposalId)` lifecycle call" — queueing itself is a separate
 * lifecycle stage this resolver reports on but does not perform.
 */
export type LifecycleEligibilityOutcome =
  | "ELIGIBLE_TO_EXECUTE"
  | "REFUSAL_TIMELOCK_PENDING"
  | "REFUSAL_CANCELED"
  | "REFUSAL_NOT_EXECUTABLE"
  | "ALREADY_EXECUTED";

export type LifecycleEligibility = {
  proposalId: string;
  rawState: number;
  stateLabel: string;
  eta: string | null;
  canceled: boolean;
  executed: boolean;
  capturedAtBlock: string;
  capturedAtTimestamp: string;
  outcome: LifecycleEligibilityOutcome;
  reason: string;
};

type EligibilityClient = Pick<PublicClient, "readContract" | "getBlock">;

/**
 * Bravo `ProposalState`: 0=Pending 1=Active 2=Canceled 3=Defeated
 * 4=Succeeded 5=Queued 6=Expired 7=Executed (see evidence/governor/bravo-methodology.md).
 */
export async function resolveBravoLifecycleEligibility(
  client: EligibilityClient,
  params: { governor: HexAddress; proposalId: bigint; blockNumber?: bigint | undefined },
): Promise<LifecycleEligibility> {
  const blockArg = params.blockNumber !== undefined ? { blockNumber: params.blockNumber } : {};

  let rawState: number;
  try {
    rawState = (await client.readContract({
      address: params.governor,
      abi: BRAVO_STATE_ABI,
      functionName: "state",
      args: [params.proposalId],
      ...blockArg,
    })) as number;
  } catch (err) {
    throw new GovernorResolutionError(
      "PROPOSAL_NOT_FOUND",
      `state(${params.proposalId}) reverted while resolving lifecycle eligibility: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  let proposalTuple: readonly [bigint, HexAddress, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean];
  try {
    proposalTuple = (await client.readContract({
      address: params.governor,
      abi: BRAVO_PROPOSALS_ABI,
      functionName: "proposals",
      args: [params.proposalId],
      ...blockArg,
    })) as typeof proposalTuple;
  } catch (err) {
    throw new GovernorResolutionError(
      "AUTHORIZATION_READ_FAILED",
      `proposals(${params.proposalId}) failed while resolving lifecycle eligibility: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
  const [, , eta, , , , , , canceled, executed] = proposalTuple;

  const block = await client.getBlock(params.blockNumber !== undefined ? { blockNumber: params.blockNumber } : {});
  const capturedAtBlock = block.number.toString();
  const capturedAtTimestamp = block.timestamp.toString();

  const stateLabel = bravoStateLabel(rawState);
  const etaStr = eta > 0n ? eta.toString() : null;

  let outcome: LifecycleEligibilityOutcome;
  let reason: string;

  if (canceled) {
    outcome = "REFUSAL_CANCELED";
    reason = "Proposal has been canceled.";
  } else if (executed) {
    outcome = "ALREADY_EXECUTED";
    reason = "Proposal has already been executed — must not submit another execution.";
  } else if (rawState === 5 /* Queued */) {
    if (etaStr !== null && block.timestamp < eta) {
      outcome = "REFUSAL_TIMELOCK_PENDING";
      reason = `Timelock eta ${eta} has not yet passed (current timestamp ${block.timestamp}).`;
    } else {
      outcome = "ELIGIBLE_TO_EXECUTE";
      reason = "Proposal is Queued and its eta has passed — eligible for execute().";
    }
  } else if (rawState === 0 /* Pending */ || rawState === 1 /* Active */) {
    outcome = "REFUSAL_NOT_EXECUTABLE";
    reason = `Proposal is still in the voting process (${stateLabel}) — not yet eligible for any lifecycle write.`;
  } else if (rawState === 4 /* Succeeded */) {
    outcome = "REFUSAL_NOT_EXECUTABLE";
    reason = "Proposal succeeded but has not been queued yet — execute() requires the Queued state.";
  } else if (rawState === 3 /* Defeated */ || rawState === 6 /* Expired */) {
    outcome = "REFUSAL_NOT_EXECUTABLE";
    reason = `Proposal is ${stateLabel} — permanently not executable.`;
  } else if (rawState === 7 /* Executed */) {
    // Defensive: `executed` flag above should already have caught this; kept as a fail-closed backstop.
    outcome = "ALREADY_EXECUTED";
    reason = "Governor reports state Executed.";
  } else {
    throw new GovernorResolutionError(
      "AUTHORIZATION_INVALID",
      `Unknown Bravo ProposalState value ${rawState} for proposal ${params.proposalId} — failing closed rather than guessing eligibility.`,
    );
  }

  return {
    proposalId: params.proposalId.toString(),
    rawState,
    stateLabel,
    eta: etaStr,
    canceled,
    executed,
    capturedAtBlock,
    capturedAtTimestamp,
    outcome,
    reason,
  };
}
