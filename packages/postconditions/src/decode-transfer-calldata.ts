import { decodeAbiParameters } from "viem";
import type { HexAddress, Hex } from "@marked/core";
import { PostconditionAdapterError } from "./errors";

export const SUPPORTED_TRANSFER_SIGNATURE = "transfer(address,uint256)";

export type DecodedErc20Transfer = {
  recipient: HexAddress;
  amount: bigint;
};

/**
 * Decodes a Bravo-style authorized `transfer(address,uint256)` action.
 *
 * Gate 3 instructions §9/§12: Governor Bravo stores `signature` and
 * `calldata` as two separate fields — `calldata` here is the ABI-encoded
 * *arguments only*, with no 4-byte function selector prefix (confirmed
 * live against Compound #220 in Gate 2 — see evidence/governor/bravo-methodology.md).
 * This is therefore decoded with `decodeAbiParameters([address, uint256],
 * calldata)`, never with viem's `decodeFunctionData` (which expects a
 * selector-prefixed payload and would misdecode or throw on Bravo's
 * representation).
 *
 * Returns a discriminated result rather than throwing so `supports()` can
 * use it as a pure boolean gate without a try/catch at every call site.
 */
export function tryDecodeErc20Transfer(
  signature: string,
  calldata: Hex,
): { ok: true; value: DecodedErc20Transfer } | { ok: false; error: PostconditionAdapterError } {
  if (signature !== SUPPORTED_TRANSFER_SIGNATURE) {
    return {
      ok: false,
      error: new PostconditionAdapterError(
        "UNSUPPORTED_ACTION",
        `ERC20TransferAdapter only supports signature '${SUPPORTED_TRANSFER_SIGNATURE}', got '${signature}'.`,
      ),
    };
  }

  try {
    const [recipient, amount] = decodeAbiParameters(
      [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      calldata,
    );
    return { ok: true, value: { recipient, amount } };
  } catch (err) {
    return {
      ok: false,
      error: new PostconditionAdapterError(
        "INVALID_TRANSFER_CALLDATA",
        `Calldata for '${SUPPORTED_TRANSFER_SIGNATURE}' failed to decode as (address,uint256): ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      ),
    };
  }
}

/** Throwing variant for call sites that already know `supports()` passed (defense in depth — should never actually throw in that path). */
export function decodeErc20Transfer(signature: string, calldata: Hex): DecodedErc20Transfer {
  const result = tryDecodeErc20Transfer(signature, calldata);
  if (!result.ok) throw result.error;
  return result.value;
}
