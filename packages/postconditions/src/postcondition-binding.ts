import type { PostconditionBinding } from "@marked/core";
import { ERC20_TRANSFER_ADAPTER_ID, ERC20_TRANSFER_ADAPTER_VERSION, type Erc20TransferExpectedState } from "./erc20-transfer-adapter";
import { PostconditionAdapterError } from "./errors";

/**
 * Gate 4 instructions §4: "The postcondition cannot be a human-written
 * promise... If manually supplied postcondition data disagrees with
 * authoritative calldata, refuse." `humanOverride`, if given, is validated
 * against the authoritative `expected` derivation and rejected on any
 * mismatch — it is never accepted as an alternative source of truth. The
 * canonical field order (`token`, `recipient`, `rawAmount`) is fixed and
 * documented here since it is part of what `computePostconditionBindingHash`
 * commits to.
 */
export function buildErc20TransferBinding(params: {
  actionIndex: number;
  expected: Erc20TransferExpectedState;
  required: boolean;
  humanOverride?: { recipient?: string; rawAmount?: string } | undefined;
}): PostconditionBinding {
  if (params.humanOverride?.recipient !== undefined && params.humanOverride.recipient.toLowerCase() !== params.expected.recipient.toLowerCase()) {
    throw new PostconditionAdapterError(
      "UNSUPPORTED_ACTION",
      `Manually supplied recipient (${params.humanOverride.recipient}) disagrees with the authoritative recipient derived from calldata (${params.expected.recipient}). Refusing — display text is never authority.`,
    );
  }
  if (params.humanOverride?.rawAmount !== undefined && BigInt(params.humanOverride.rawAmount) !== params.expected.authorizedAmount) {
    throw new PostconditionAdapterError(
      "UNSUPPORTED_ACTION",
      `Manually supplied amount (${params.humanOverride.rawAmount}) disagrees with the authoritative amount derived from calldata (${params.expected.authorizedAmount}). Refusing — display text is never authority.`,
    );
  }

  return {
    actionIndex: params.actionIndex,
    adapterId: ERC20_TRANSFER_ADAPTER_ID,
    adapterVersion: ERC20_TRANSFER_ADAPTER_VERSION,
    required: params.required,
    bindingParams: [
      { key: "token", value: params.expected.token },
      { key: "recipient", value: params.expected.recipient },
      { key: "rawAmount", value: params.expected.authorizedAmount.toString() },
    ],
  };
}
