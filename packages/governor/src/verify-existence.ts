import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { mainnet, sepolia, baseSepolia } from "viem/chains";
import type { ChainId, HexAddress } from "@marked/core";

/**
 * Minimal, family-agnostic read: `state(uint256) view returns (uint8)`.
 * Both Governor Bravo (Compound's GovernorBravoDelegate) and OpenZeppelin
 * Governor implement `state()` — this is deliberately the smallest common
 * read across the two families observed in Gate 1A/1C evidence
 * (governorbravo, openzeppelingovernor), not a full ABI.
 *
 * This is NOT Gate 2's canonical action-bundle reconstruction. It answers
 * only "is this a real, queryable governance proposal at this coordinate,"
 * matching the same bar Gate 1A's onchain sanity check already used —
 * formalized here as a reusable function instead of a one-off script.
 */
const MINIMAL_STATE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "state",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const CHAINS_BY_ID: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  84532: baseSepolia,
};

export type GovernorExistenceCheck =
  | { ok: true; hasCode: true; stateReadable: true; state: number }
  | { ok: false; hasCode: boolean; stateReadable: boolean; reason: string };

/**
 * Independent RPC verification that a `GovernanceCoordinate` points to a
 * real, queryable governance object — never to authoritative action data.
 * Confirms: contract exists at `governor`, and `state(proposalId)` reads
 * without reverting. Does not extract targets/values/calldatas — that
 * remains Gate 2 (`readGovernorActions` in src/index.ts, still
 * NOT_IMPLEMENTED).
 */
export async function verifyGovernorProposalExists(params: {
  chainId: ChainId;
  governor: HexAddress;
  proposalId: string;
  rpcUrl?: string | undefined;
  /** Injectable for tests — bypasses real network I/O. */
  clientOverride?: Pick<PublicClient, "getCode" | "readContract"> | undefined;
}): Promise<GovernorExistenceCheck> {
  let client: Pick<PublicClient, "getCode" | "readContract">;
  if (params.clientOverride) {
    client = params.clientOverride;
  } else {
    const chain = CHAINS_BY_ID[params.chainId];
    if (!chain) {
      return { ok: false, hasCode: false, stateReadable: false, reason: `Unsupported chainId for existence check: ${params.chainId}` };
    }
    client = createPublicClient({ chain, transport: http(params.rpcUrl) });
  }

  let bytecode: `0x${string}` | undefined;
  try {
    bytecode = await client.getCode({ address: params.governor });
  } catch (err) {
    return {
      ok: false,
      hasCode: false,
      stateReadable: false,
      reason: `eth_getCode failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const hasCode = !!bytecode && bytecode !== "0x";
  if (!hasCode) {
    return { ok: false, hasCode: false, stateReadable: false, reason: "No contract code at governor address." };
  }

  try {
    const state = await client.readContract({
      address: params.governor,
      abi: MINIMAL_STATE_ABI,
      functionName: "state",
      args: [BigInt(params.proposalId)],
    });
    return { ok: true, hasCode: true, stateReadable: true, state };
  } catch (err) {
    return {
      ok: false,
      hasCode: true,
      stateReadable: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
