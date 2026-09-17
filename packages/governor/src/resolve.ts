import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { mainnet, sepolia, baseSepolia } from "viem/chains";
import {
  computeActionAuthorizationHash,
  type ChainId,
  type GovernorBravoActionAuthorization,
  type GovernorLifecycleSnapshot,
  type Hex,
  type HexAddress,
} from "@marked/core";
import { bravoStateLabel } from "./bravo-abi";
import { readBravoActions, readBravoLifecycle } from "./bravo-adapter";
import { GovernorResolutionError } from "./errors";
import { detectGovernorFamily } from "./family-detection";

const CHAINS_BY_ID: Record<number, Chain> = { 1: mainnet, 11155111: sepolia, 84532: baseSepolia };

export type GovernorProposalCoordinate = {
  chainId: ChainId;
  governor: HexAddress;
  proposalId: string;
};

export type GovernorAuthorizationEvidence = {
  rpcChainId: number;
  resolvedAtBlock: string;
  governor: HexAddress;
  proposalId: string;
  governorFamily: "GOVERNOR_BRAVO";
  readMethods: readonly string[];
  actionAuthorizationHash: Hex;
  resolvedAt: string;
};

export type ResolvedGovernorAuthorization = {
  coordinate: GovernorProposalCoordinate;
  authorization: GovernorBravoActionAuthorization;
  actionAuthorizationHash: Hex;
  lifecycle: GovernorLifecycleSnapshot;
  resolvedAtBlock: string;
  evidence: GovernorAuthorizationEvidence;
};

export type ResolveGovernorAuthorizationOptions = {
  rpcUrl?: string | undefined;
  /** Injectable for tests — bypasses real network I/O. */
  clientOverride?: (Pick<PublicClient, "getCode" | "readContract" | "getBlockNumber"> & { chain?: unknown }) | undefined;
};

/**
 * The canonical Governor Authorization Engine's entry point — Gate 2
 * instructions §17. Accepts a bare coordinate (chain, governor, proposal
 * id); this package never imports `@marked/cactus` — see §14, "the
 * Governor package should not require Cactus." A `GovernanceCoordinate`
 * from `@marked/cactus` can feed this coordinate's shape, but the
 * dependency runs one way only.
 *
 * Read-only. Performs no writes, no KeeperHub calls, no execution of any
 * kind — this is the authorization *resolution* engine, not the
 * fulfillment engine.
 */
export async function resolveGovernorAuthorization(
  coordinate: GovernorProposalCoordinate,
  options: ResolveGovernorAuthorizationOptions = {},
): Promise<ResolvedGovernorAuthorization> {
  const client = options.clientOverride ?? buildClient(coordinate.chainId, options.rpcUrl);

  const bytecode = await safeGetCode(client, coordinate.governor);
  if (!bytecode || bytecode === "0x") {
    throw new GovernorResolutionError("GOVERNOR_NOT_FOUND", `No contract code at ${coordinate.governor} on chain ${coordinate.chainId}.`);
  }

  const family = await detectGovernorFamily(client, coordinate.governor);
  if (family !== "GOVERNOR_BRAVO") {
    throw new GovernorResolutionError(
      "UNSUPPORTED_GOVERNOR_FAMILY",
      `Governor ${coordinate.governor} did not respond to the Bravo family probe (initialProposalId()). ` +
        "Gate 2 implements Governor Bravo only — see DECISIONS.md.",
    );
  }

  // Block-pinned reads (Gate 2 instructions §13): capture the block number
  // once, then pin every subsequent read to it, so actions and lifecycle
  // describe one coherent snapshot rather than two different blocks.
  const resolvedAtBlock = await client.getBlockNumber();

  const proposalId = BigInt(coordinate.proposalId);
  const actions = await readBravoActions(client, { governor: coordinate.governor, proposalId, blockNumber: resolvedAtBlock });
  const lifecycleReads = await readBravoLifecycle(client, { governor: coordinate.governor, proposalId, blockNumber: resolvedAtBlock });

  const authorization: GovernorBravoActionAuthorization = {
    version: 1,
    chainId: coordinate.chainId,
    governor: coordinate.governor,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: coordinate.proposalId,
    actions,
  };

  const actionAuthorizationHash = computeActionAuthorizationHash(authorization);

  const lifecycle: GovernorLifecycleSnapshot = {
    family: "GOVERNOR_BRAVO",
    proposalId: coordinate.proposalId,
    state: lifecycleReads.state,
    eta: lifecycleReads.eta > 0n ? lifecycleReads.eta.toString() : null,
    graceEndsAt: null, // Requires a separate Timelock read (GRACE_PERIOD()); not resolved in Gate 2 — see evidence/governor/bravo-methodology.md.
    capturedAtBlock: resolvedAtBlock.toString(),
    capturedAtTimestamp: null,
    observedAt: new Date().toISOString(),
  };

  const evidence: GovernorAuthorizationEvidence = {
    rpcChainId: coordinate.chainId,
    resolvedAtBlock: resolvedAtBlock.toString(),
    governor: coordinate.governor,
    proposalId: coordinate.proposalId,
    governorFamily: "GOVERNOR_BRAVO",
    readMethods: ["initialProposalId()", "getActions(uint256)", "state(uint256)", "proposals(uint256)"],
    actionAuthorizationHash,
    resolvedAt: lifecycle.observedAt,
  };

  return {
    coordinate,
    authorization,
    actionAuthorizationHash,
    lifecycle,
    resolvedAtBlock: resolvedAtBlock.toString(),
    evidence,
  };
}

export { bravoStateLabel };

function buildClient(chainId: number, rpcUrl: string | undefined): PublicClient {
  const chain = CHAINS_BY_ID[chainId];
  if (!chain) {
    throw new GovernorResolutionError("UNSUPPORTED_CHAIN", `chainId ${chainId} is not supported by the Governor engine.`);
  }
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

async function safeGetCode(
  client: Pick<PublicClient, "getCode">,
  address: HexAddress,
): Promise<Hex | undefined> {
  try {
    return await client.getCode({ address });
  } catch (err) {
    throw new GovernorResolutionError("GOVERNOR_NOT_FOUND", `eth_getCode failed for ${address}: ${err instanceof Error ? err.message : String(err)}`, err);
  }
}
