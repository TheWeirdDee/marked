import { createPublicClient, http, type PublicClient } from "viem";
import type { ChainId, FulfillmentCommitment, Hex, HexAddress, PostconditionCoverage } from "@marked/core";
import { assessFulfillability, type FulfillabilityAssessment } from "@marked/core";
import {
  resolveGovernorAuthorization,
  resolveBravoLifecycleEligibility,
  GovernorResolutionError,
  chainById,
  type ResolvedGovernorAuthorization,
  type LifecycleEligibility,
} from "@marked/governor";
import { resolveCactusProposal, toGovernanceCoordinate, CactusResolutionError, type ResolvedCactusProposal } from "@marked/cactus";
import {
  tryDecodeErc20Transfer,
  classifyCoverage,
  ERC20_TRANSFER_ADAPTER_ID,
  ERC20_TRANSFER_ADAPTER_VERSION,
} from "@marked/postconditions";
import type { PostconditionBinding } from "@marked/core";

/**
 * Gate 9R — the real `/app/new` proposal-intake pipeline. This is
 * orchestration only: every fact-finding step delegates to the already-proven
 * engine (`@marked/cactus`, `@marked/governor`, `@marked/postconditions`,
 * `@marked/core`'s `assessFulfillability`) and nothing here invents a value
 * those packages did not return. No KeeperHub call occurs anywhere in this
 * file — resolving/browsing a proposal is read-only.
 */

/**
 * Gate 12 §CACTUS-LIVE-001 — this used to maintain its own independent
 * `CHAINS_BY_ID` map, separate from `packages/governor`'s two internal
 * copies of the same list. That third, independently-drifted copy was
 * missing Optimism (chainId 10) while the others didn't need it yet — a
 * real Cactus-indexed Optimism proposal failed with `UNSUPPORTED_CHAIN`
 * as a result, not because Optimism is architecturally unsupportable.
 * `chainById` from `@marked/governor` is now the single source of truth
 * for "which chains can a real RPC client be opened against" — see
 * `packages/governor/src/supported-chains.ts`.
 */
/** Exported so the execution-pipeline modules (apps/web/src/lib/execution/*) build RPC clients against the exact same URL resolution — never a second, independently-drifting copy (the CACTUS-LIVE-001 lesson). */
export function rpcUrlFor(chainId: number): string | undefined {
  if (chainId === 1) return process.env["ETHEREUM_RPC_URL"];
  if (chainId === 11155111) return process.env["SEPOLIA_RPC_URL"];
  if (chainId === 10) return process.env["OPTIMISM_RPC_URL"];
  return undefined;
}

/**
 * Test-only hook, matching the established pattern already used elsewhere in
 * this app (`resetAppStoreForTests`, `resetRateLimitStateForTests`): lets a
 * test inject a fake `PublicClient` instead of a real one, without adding a
 * test-only parameter to every function that calls `buildClient`. Never
 * referenced by production code paths.
 */
let clientOverrideForTests: ((chainId: number) => PublicClient) | null = null;
export function setClientOverrideForTests(fn: ((chainId: number) => PublicClient) | null): void {
  clientOverrideForTests = fn;
}

export function buildClient(chainId: number): PublicClient {
  if (clientOverrideForTests) return clientOverrideForTests(chainId);
  const chain = chainById(chainId);
  if (!chain) throw new GovernorResolutionError("UNSUPPORTED_CHAIN", `chainId ${chainId} is not supported.`);
  return createPublicClient({ chain, transport: http(rpcUrlFor(chainId)) });
}

export type DecodedAction = {
  actionIndex: number;
  target: HexAddress;
  signature: string;
  calldata: Hex;
  value: string;
  decoded: { recipient: HexAddress; amount: string } | null;
  humanSummary: string | null;
};

export type GovernanceIntakeResult = {
  cactus: ResolvedCactusProposal;
  coordinate: { chainId: ChainId; governor: HexAddress; proposalId: string };
  familySupported: boolean;
  familyError: string | null;
  authorization: ResolvedGovernorAuthorization | null;
  eligibility: LifecycleEligibility | null;
  eligibilityError: string | null;
  actions: DecodedAction[];
  postconditionCoverage: PostconditionCoverage;
  fulfillability: FulfillabilityAssessment;
  /** Only populated when `fulfillability.canArm` is true. */
  commitment: FulfillmentCommitment | null;
};

function buildBindingForAction(action: DecodedAction, required: boolean): PostconditionBinding {
  if (!action.decoded) throw new Error(`Action ${action.actionIndex} has no decoded (supported) semantics — cannot bind.`);
  return {
    actionIndex: action.actionIndex,
    adapterId: ERC20_TRANSFER_ADAPTER_ID,
    adapterVersion: ERC20_TRANSFER_ADAPTER_VERSION,
    required,
    bindingParams: [
      { key: "token", value: action.target },
      { key: "recipient", value: action.decoded.recipient },
      { key: "rawAmount", value: action.decoded.amount },
    ],
  };
}

export async function resolveGovernanceIntake(proposalUrl: string): Promise<GovernanceIntakeResult> {
  const { resolved: cactus } = await resolveCactusProposal({ proposalUrl });
  const { coordinate } = toGovernanceCoordinate(cactus);

  let authorization: ResolvedGovernorAuthorization | null = null;
  let familySupported = true;
  let familyError: string | null = null;
  try {
    authorization = await resolveGovernorAuthorization(coordinate, { rpcUrl: rpcUrlFor(coordinate.chainId) });
  } catch (err) {
    if (err instanceof GovernorResolutionError && err.code === "UNSUPPORTED_GOVERNOR_FAMILY") {
      familySupported = false;
      familyError = err.message;
    } else {
      throw err;
    }
  }

  let eligibility: LifecycleEligibility | null = null;
  let eligibilityError: string | null = null;
  if (authorization) {
    try {
      const client = buildClient(coordinate.chainId);
      eligibility = await resolveBravoLifecycleEligibility(client, {
        governor: coordinate.governor,
        proposalId: BigInt(coordinate.proposalId),
        blockNumber: BigInt(authorization.resolvedAtBlock),
      });
    } catch (err) {
      eligibilityError = err instanceof Error ? err.message : String(err);
    }
  }

  const actions: DecodedAction[] = (authorization?.authorization.actions ?? []).map((a) => {
    const attempt = tryDecodeErc20Transfer(a.signature, a.calldata);
    const decoded = attempt.ok ? { recipient: attempt.value.recipient, amount: attempt.value.amount.toString() } : null;
    return {
      actionIndex: a.actionIndex,
      target: a.target,
      signature: a.signature,
      calldata: a.calldata,
      value: a.value,
      decoded,
      humanSummary: decoded ? `Send ${decoded.amount} raw units of ${a.target} to ${decoded.recipient}` : null,
    };
  });

  const requiredActionIndexes = actions.map((a) => a.actionIndex);
  const supportedActionIndexes = actions.filter((a) => a.decoded).map((a) => a.actionIndex);
  const postconditionCoverage: PostconditionCoverage = authorization
    ? classifyCoverage({ requiredActionIndexes, supportedActionIndexes })
    : "UNSUPPORTED";

  const fulfillability = assessFulfillability({
    governorFamilySupported: familySupported,
    eligibility: eligibility ? { outcome: eligibility.outcome, reason: eligibility.reason } : null,
    postconditionCoverage,
    callerAuthorized: true,
    callerReason: "Governor Bravo's execute()/queue() entrypoints are permissionless — proven from reference source (evidence/governor/bravo-methodology.md), no per-caller check required.",
  });

  let commitment: FulfillmentCommitment | null = null;
  if (fulfillability.canArm && authorization) {
    commitment = {
      version: 1,
      chainId: coordinate.chainId,
      governor: coordinate.governor,
      governorFamily: "GOVERNOR_BRAVO",
      proposalId: coordinate.proposalId,
      frozenActionAuthorizationHash: authorization.actionAuthorizationHash,
      selectedActionIndexes: supportedActionIndexes,
      postconditionBindings: supportedActionIndexes.map((i) => buildBindingForAction(actions[i]!, true)),
      fulfillmentMode: "APPROVE",
      executionSurfaceId: "keeperhub-direct-contract-call-v1",
      executionPolicyVersion: "1",
    };
  }

  return {
    cactus,
    coordinate,
    familySupported,
    familyError,
    authorization,
    eligibility,
    eligibilityError,
    actions,
    postconditionCoverage,
    fulfillability,
    commitment,
  };
}

export { CactusResolutionError };

/** Fresh, live re-resolution of just the authorization hash for a job's existing coordinate — used immediately before arming (Gate 5's "revalidate before write" discipline, Part 32/BUILD_CONTRACT law 28). */
export async function refreshAuthorizationHash(params: { chainId: ChainId; governor: HexAddress; proposalId: string }): Promise<Hex> {
  const resolved = await resolveGovernorAuthorization(
    { chainId: params.chainId, governor: params.governor, proposalId: params.proposalId },
    { rpcUrl: rpcUrlFor(params.chainId) },
  );
  return resolved.actionAuthorizationHash;
}
