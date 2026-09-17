import type {
  BoundPostcondition,
  EconomicPostconditionAdapter,
  PostconditionCoverage,
  PostconditionReadClient,
  ProposalActionContext,
} from "@marked/core";
import { PostconditionAdapterError } from "./errors";
import { ERC20TransferAdapter } from "./erc20-transfer-adapter";

export { PostconditionAdapterError, type PostconditionAdapterErrorCode } from "./errors";

export {
  tryDecodeErc20Transfer,
  decodeErc20Transfer,
  SUPPORTED_TRANSFER_SIGNATURE,
  type DecodedErc20Transfer,
} from "./decode-transfer-calldata";

export {
  decodeTokenTransferLogs,
  matchTransferLog,
  type DecodedTransferLog,
  type TransferLogMatchResult,
} from "./transfer-log-match";

export {
  ERC20TransferAdapter,
  ERC20_TRANSFER_ADAPTER_ID,
  ERC20_TRANSFER_ADAPTER_VERSION,
  type Erc20TransferPreState,
  type Erc20TransferExpectedState,
  type Erc20TransferObservedState,
  type Erc20TransferVerificationReason,
} from "./erc20-transfer-adapter";

export { ERC20_BALANCE_OF_ABI, ERC20_DECIMALS_ABI, ERC20_SYMBOL_ABI, ERC20_TRANSFER_EVENT_TOPIC0 } from "./erc20-abi";

export { buildErc20TransferBinding } from "./postcondition-binding";

/** @deprecated Gate 0 naming. Any remaining unimplemented adapter (Gate 3 instructions §5 — CompoundV3ReserveAdapter etc. are explicitly out of scope) still throws this. */
export class PostconditionNotImplementedError extends Error {
  constructor(adapterId: string) {
    super(
      `Postcondition adapter '${adapterId}' is not implemented. ` +
        "Gate 3 implements ERC20TransferAdapter only — see GATES.md and CLAIMS.md.",
    );
    this.name = "PostconditionNotImplementedError";
  }
}

export type PostconditionAssertionResult = {
  assertion: BoundPostcondition;
  passed: boolean;
  observed: unknown;
  evidenceBlock: string;
};

const ADAPTER_REGISTRY: Record<string, EconomicPostconditionAdapter<unknown, unknown, unknown>> = {
  [`${ERC20TransferAdapter.id}@${ERC20TransferAdapter.version}`]: ERC20TransferAdapter as unknown as EconomicPostconditionAdapter<
    unknown,
    unknown,
    unknown
  >,
};

/**
 * Evaluates one bound postcondition assertion against live protocol/token
 * state at a pinned block, dispatching to the adapter named by
 * `assertion.adapterId`/`adapterVersion`. Gate 0 left this throwing
 * unconditionally ("not implemented until Gate 3"); Gate 3 now implements
 * it for the one proven adapter (`erc20-transfer`) and continues to fail
 * closed — via the same typed error, not a fabricated result — for any
 * other adapter id, since only `ERC20TransferAdapter` is proven.
 */
export async function evaluatePostcondition(
  assertion: BoundPostcondition,
  ctx: ProposalActionContext,
  client: PostconditionReadClient,
): Promise<PostconditionAssertionResult> {
  const adapter = ADAPTER_REGISTRY[`${assertion.adapterId}@${assertion.adapterVersion}`];
  if (!adapter) {
    throw new PostconditionNotImplementedError(assertion.adapterId);
  }
  if (!adapter.supports(ctx)) {
    throw new PostconditionAdapterError(
      "UNSUPPORTED_ACTION",
      `Adapter '${assertion.adapterId}' does not support the action at index ${ctx.actionIndex} (signature '${ctx.signature}').`,
    );
  }

  const preState = await adapter.snapshot(client, ctx);
  const expected = adapter.deriveExpected(preState, ctx);
  const result = await adapter.verify(client, preState, expected, ctx);

  return {
    assertion,
    passed: result.verified,
    observed: result.observed,
    evidenceBlock: ctx.verificationBlock ?? "unknown",
  };
}

/**
 * Structural coverage classification for a proposal's postcondition
 * bundle — Gate 3 instructions §27-28. Pure/synchronous: given which
 * actions are required and which have a supported adapter, decide FULL,
 * PARTIAL, or UNSUPPORTED. Never evaluates assertions itself (that's each
 * adapter's `verify()`), and never lets one verified assertion make an
 * otherwise-incomplete bundle look green.
 */
export function classifyCoverage(params: {
  requiredActionIndexes: readonly number[];
  supportedActionIndexes: readonly number[];
}): PostconditionCoverage {
  if (params.requiredActionIndexes.length === 0) return "UNSUPPORTED";
  const supported = new Set(params.supportedActionIndexes);
  const supportedRequiredCount = params.requiredActionIndexes.filter((i) => supported.has(i)).length;
  if (supportedRequiredCount === 0) return "UNSUPPORTED";
  if (supportedRequiredCount === params.requiredActionIndexes.length) return "FULL";
  return "PARTIAL";
}

/**
 * `MARKED ✓`-equivalent bundle-level verification per PRD §8.6 / Invariant
 * 30: FULL coverage is necessary but not sufficient — every required
 * assertion must also have actually verified. PARTIAL and UNSUPPORTED can
 * never be reported as green, regardless of how many individual assertions
 * passed.
 */
export function isBundleVerified(params: {
  coverage: PostconditionCoverage;
  requiredAssertions: readonly BoundPostcondition[];
  verifiedActionIndexes: readonly number[];
}): boolean {
  if (params.coverage !== "FULL") return false;
  const verified = new Set(params.verifiedActionIndexes);
  return params.requiredAssertions.every((a) => verified.has(a.actionIndex));
}
