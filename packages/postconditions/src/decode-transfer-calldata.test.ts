import { describe, expect, it } from "vitest";
import { encodeAbiParameters, getAddress } from "viem";
import type { HexAddress } from "@marked/core";
import { decodeErc20Transfer, tryDecodeErc20Transfer } from "./decode-transfer-calldata";
import { PostconditionAdapterError } from "./errors";

const VALID_RECIPIENT: HexAddress = getAddress("0x0000000000000000000000000000000000000bbb");
const AMOUNT = 50000000000n;

function encodeTransferArgs(recipient: HexAddress, amount: bigint) {
  return encodeAbiParameters(
    [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    [recipient, amount],
  );
}

describe("tryDecodeErc20Transfer — canonical Bravo-style calldata (no 4-byte selector)", () => {
  it("decodes recipient and amount correctly from valid transfer(address,uint256) calldata", () => {
    const calldata = encodeTransferArgs(VALID_RECIPIENT, AMOUNT);
    const result = tryDecodeErc20Transfer("transfer(address,uint256)", calldata);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recipient.toLowerCase()).toBe(VALID_RECIPIENT.toLowerCase());
      expect(result.value.amount).toBe(AMOUNT);
    }
  });

  it("rejects transferFrom(address,address,uint256) — not the supported signature", () => {
    const result = tryDecodeErc20Transfer("transferFrom(address,address,uint256)", "0x00");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_ACTION");
  });

  it("rejects an unknown/unsupported signature", () => {
    const result = tryDecodeErc20Transfer("setTargetReserves(address,uint104)", "0x00");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_ACTION");
  });

  it("fails closed on malformed calldata even with the right signature", () => {
    const result = tryDecodeErc20Transfer("transfer(address,uint256)", "0xdead");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSFER_CALLDATA");
  });

  it("does NOT expect a 4-byte function selector prefix in calldata (Bravo stores signature and calldata separately)", () => {
    // A selector-prefixed payload (as decodeFunctionData would expect) must NOT decode cleanly as (address,uint256) args-only.
    const selectorPrefixed = ("0xa9059cbb" + encodeTransferArgs(VALID_RECIPIENT, AMOUNT).slice(2)) as `0x${string}`;
    const result = tryDecodeErc20Transfer("transfer(address,uint256)", selectorPrefixed);
    // Either it fails to decode, or it decodes to the wrong (shifted) values — assert it does not produce the correct amount.
    if (result.ok) {
      expect(result.value.amount).not.toBe(AMOUNT);
    } else {
      expect(result.error.code).toBe("INVALID_TRANSFER_CALLDATA");
    }
  });
});

describe("decodeErc20Transfer — throwing variant", () => {
  it("returns the same value as the non-throwing variant on success", () => {
    const calldata = encodeTransferArgs(VALID_RECIPIENT, AMOUNT);
    const value = decodeErc20Transfer("transfer(address,uint256)", calldata);
    expect(value.amount).toBe(AMOUNT);
  });

  it("throws PostconditionAdapterError on an unsupported signature", () => {
    expect(() => decodeErc20Transfer("transferFrom(address,address,uint256)", "0x00")).toThrow(PostconditionAdapterError);
  });
});
