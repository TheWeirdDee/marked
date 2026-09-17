import type { PublicClient } from "viem";
import type { GovernorAuthorizedAction, Hex, HexAddress } from "@marked/core";
import { BRAVO_GET_ACTIONS_ABI, BRAVO_PROPOSALS_ABI, BRAVO_STATE_ABI } from "./bravo-abi";
import { GovernorResolutionError } from "./errors";

type BravoClient = Pick<PublicClient, "readContract">;

/**
 * Reads `getActions(proposalId)` — the sole authoritative source of a
 * Bravo proposal's action bundle — and canonicalizes it into
 * `GovernorAuthorizedAction[]`. Pinned to `blockNumber` when provided, so
 * this read is part of one coherent block snapshot with the lifecycle
 * read alongside it.
 */
export async function readBravoActions(
  client: BravoClient,
  params: { governor: HexAddress; proposalId: bigint; blockNumber?: bigint | undefined },
): Promise<readonly GovernorAuthorizedAction[]> {
  let result: readonly [readonly HexAddress[], readonly bigint[], readonly string[], readonly Hex[]];
  try {
    result = (await client.readContract({
      address: params.governor,
      abi: BRAVO_GET_ACTIONS_ABI,
      functionName: "getActions",
      args: [params.proposalId],
      ...(params.blockNumber !== undefined ? { blockNumber: params.blockNumber } : {}),
    })) as typeof result;
  } catch (err) {
    throw new GovernorResolutionError(
      "AUTHORIZATION_READ_FAILED",
      `getActions(${params.proposalId}) failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const [targets, values, signatures, calldatas] = result;
  if (targets.length !== values.length || targets.length !== signatures.length || targets.length !== calldatas.length) {
    throw new GovernorResolutionError(
      "RPC_INCONSISTENT_READ",
      `getActions(${params.proposalId}) returned mismatched array lengths: ` +
        `targets=${targets.length} values=${values.length} signatures=${signatures.length} calldatas=${calldatas.length}`,
    );
  }

  return targets.map((target, i) => ({
    actionIndex: i,
    target,
    value: values[i]!.toString(),
    signature: signatures[i]!,
    calldata: calldatas[i]!,
  }));
}

export type BravoLifecycleReads = {
  state: number;
  eta: bigint;
  canceled: boolean;
  executed: boolean;
  onchainId: bigint;
};

/**
 * Reads `state(proposalId)` and `proposals(proposalId)` (for `eta`,
 * `canceled`, `executed`, and the proposal's own self-reported `id`, used
 * as a consistency check), pinned to the same block as the action read.
 */
export async function readBravoLifecycle(
  client: BravoClient,
  params: { governor: HexAddress; proposalId: bigint; blockNumber?: bigint | undefined },
): Promise<BravoLifecycleReads> {
  const blockArg = params.blockNumber !== undefined ? { blockNumber: params.blockNumber } : {};

  let state: number;
  try {
    state = (await client.readContract({
      address: params.governor,
      abi: BRAVO_STATE_ABI,
      functionName: "state",
      args: [params.proposalId],
      ...blockArg,
    })) as number;
  } catch (err) {
    throw new GovernorResolutionError(
      "PROPOSAL_NOT_FOUND",
      `state(${params.proposalId}) reverted — proposal does not exist at this Governor: ${
        err instanceof Error ? err.message : String(err)
      }`,
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
      `proposals(${params.proposalId}) failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const [onchainId, , eta, , , , , , canceled, executed] = proposalTuple;

  if (onchainId !== params.proposalId) {
    throw new GovernorResolutionError(
      "RPC_INCONSISTENT_READ",
      `proposals(${params.proposalId}) self-reported id ${onchainId}, expected ${params.proposalId}.`,
    );
  }

  return { state, eta, canceled, executed, onchainId };
}
