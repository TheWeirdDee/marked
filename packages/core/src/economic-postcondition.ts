import type { PublicClient } from "viem";
import type { ChainId, Hex, HexAddress } from "./types";
import type { GovernorAuthorizedAction } from "./hash-domains";

/**
 * Gate 3 — "What economic reality would prove authorization was fulfilled?"
 *
 * A transaction receipt with `status: 1` proves the lifecycle call did not
 * revert. It proves nothing about whether the specific economic effect
 * governance authorized actually occurred (BUILD_CONTRACT.md law: "Transaction
 * success is not economic truth", PRD Invariant 11). `EconomicPostconditionAdapter`
 * is the deterministic, independently-verifiable check that closes that gap.
 *
 * Every field an adapter needs to derive "what was authorized" comes from
 * `ProposalActionContext.{target,signature,calldata}` — which must
 * originate from a Governor's own authoritative action bundle (Gate 2's
 * `GovernorAuthorizedAction`), never from proposal prose, Cactus metadata,
 * or an AI's interpretation of either. See `buildProposalActionContext`
 * below: it is the only sanctioned constructor, and it only accepts a real
 * `GovernorAuthorizedAction`.
 */
export type ProposalActionContext = {
  chainId: ChainId;
  governor: HexAddress;
  proposalId: string;
  actionIndex: number;

  /** These three fields — target/signature/calldata — MUST originate from Gate 2's authoritative action bundle. */
  target: HexAddress;
  /** Wei, as a decimal string. */
  value: string;
  signature: string;
  calldata: Hex;

  /** Binds this context to the specific frozen commitment it was resolved under. */
  authorizationHash: Hex;

  /** Decimal block-number strings, not bigint — consistent with `GovernorLifecycleSnapshot`. Absent until the corresponding read/execution has happened. */
  preStateBlock?: string | undefined;
  executionBlock?: string | undefined;
  /** The transaction that (is expected to have) performed the authorized effect. Required for execution-bound log evidence (see ERC20TransferAdapter) — without it, an adapter cannot bind observed log evidence to a specific execution. */
  executionTxHash?: Hex | undefined;
  verificationBlock?: string | undefined;
};

/**
 * The only sanctioned way to build a `ProposalActionContext` from a real
 * Governor action bundle. This exists so "target/signature/calldata came
 * from the authoritative Governor action" is enforced by construction in
 * every call site that uses it, not merely by convention — Gate 3
 * instructions §8: "Do not create an independent manually supplied
 * 'expected transfer' object that bypasses authorization."
 */
export function buildProposalActionContext(params: {
  chainId: ChainId;
  governor: HexAddress;
  proposalId: string;
  authorizationHash: Hex;
  action: GovernorAuthorizedAction;
  preStateBlock?: string | undefined;
  executionBlock?: string | undefined;
  executionTxHash?: Hex | undefined;
  verificationBlock?: string | undefined;
}): ProposalActionContext {
  return {
    chainId: params.chainId,
    governor: params.governor,
    proposalId: params.proposalId,
    actionIndex: params.action.actionIndex,
    target: params.action.target,
    value: params.action.value,
    signature: params.action.signature,
    calldata: params.action.calldata,
    authorizationHash: params.authorizationHash,
    preStateBlock: params.preStateBlock,
    executionBlock: params.executionBlock,
    executionTxHash: params.executionTxHash,
    verificationBlock: params.verificationBlock,
  };
}

/** One piece of deterministic, inspectable evidence backing a verification result. Never a prose explanation alone — `details` carries the concrete values compared. */
export type VerificationEvidence = {
  kind: string;
  description: string;
  passed: boolean;
  details: Record<string, unknown>;
};

export type EconomicVerificationResult<TObserved> = {
  verified: boolean;
  observed: TObserved;
  discrepancy?: string | undefined;
  evidence: VerificationEvidence[];
};

/**
 * Minimal read surface an adapter needs. A `Pick` of viem's `PublicClient`
 * so adapters declare exactly what they touch (mirrors the pattern already
 * used in packages/governor's `ResolveGovernorAuthorizationOptions`) and so
 * tests can inject a fake without spinning up a real client.
 */
export type PostconditionReadClient = Pick<PublicClient, "readContract" | "getTransactionReceipt" | "getBlockNumber">;

/**
 * PRD §4.5 / Gate 3 instructions §7. Adapters read and assert; they never
 * change what was authorized (PRD §6 authority table: "Postcondition
 * adapter | Read and assert target state | Change execution payload").
 */
export interface EconomicPostconditionAdapter<TPre, TExpected, TObserved> {
  id: string;
  protocol: string;
  actionType: string;
  version: string;

  /** Fails closed: true only when `ctx` deterministically matches this adapter's narrow supported semantics. Never based on proposal title/description text. */
  supports(ctx: ProposalActionContext): boolean;

  /** Block-pinned read of whatever state must be captured before the authorized effect happens. */
  snapshot(client: PostconditionReadClient, ctx: ProposalActionContext): Promise<TPre>;

  /** Pure and synchronous — derives the expected post-effect state from `preState` and `ctx` alone (which itself derives from the authoritative action). No network I/O. */
  deriveExpected(preState: TPre, ctx: ProposalActionContext): TExpected;

  verify(
    client: PostconditionReadClient,
    preState: TPre,
    expected: TExpected,
    ctx: ProposalActionContext,
  ): Promise<EconomicVerificationResult<TObserved>>;
}
