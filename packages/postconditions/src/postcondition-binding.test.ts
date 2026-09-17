import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import type { HexAddress } from "@marked/core";
import { buildErc20TransferBinding } from "./postcondition-binding";
import { PostconditionAdapterError } from "./errors";
import type { Erc20TransferExpectedState } from "./erc20-transfer-adapter";

const TOKEN: HexAddress = getAddress("0x000000000000000000000000000000000000aaa1");
const RECIPIENT: HexAddress = getAddress("0x000000000000000000000000000000000000bbb1");

const EXPECTED: Erc20TransferExpectedState = {
  token: TOKEN,
  recipient: RECIPIENT,
  authorizedAmount: 60000000000n,
  expectedRecipientBalanceAfter: 61000000000n,
};

describe("buildErc20TransferBinding — derivation from authoritative expected state", () => {
  it("binds token/recipient/rawAmount in canonical order, derived from the adapter's own ExpectedState", () => {
    const binding = buildErc20TransferBinding({ actionIndex: 0, expected: EXPECTED, required: true });
    expect(binding.actionIndex).toBe(0);
    expect(binding.adapterId).toBe("erc20-transfer");
    expect(binding.adapterVersion).toBe("1");
    expect(binding.required).toBe(true);
    expect(binding.bindingParams).toEqual([
      { key: "token", value: TOKEN },
      { key: "recipient", value: RECIPIENT },
      { key: "rawAmount", value: "60000000000" },
    ]);
  });
});

describe("buildErc20TransferBinding — manual override validation (Gate 4 instructions §4, §12 test 23)", () => {
  it("accepts a human override that matches the authoritative value exactly", () => {
    const binding = buildErc20TransferBinding({
      actionIndex: 0,
      expected: EXPECTED,
      required: true,
      humanOverride: { recipient: RECIPIENT, rawAmount: "60000000000" },
    });
    expect(binding.bindingParams[2]!.value).toBe("60000000000");
  });

  it("rejects a human-supplied recipient that disagrees with the authoritative calldata-derived recipient", () => {
    const otherRecipient = getAddress("0x000000000000000000000000000000000000ccc1");
    expect(() =>
      buildErc20TransferBinding({ actionIndex: 0, expected: EXPECTED, required: true, humanOverride: { recipient: otherRecipient } }),
    ).toThrow(PostconditionAdapterError);
  });

  it("rejects a human-supplied amount that disagrees with the authoritative calldata-derived amount", () => {
    expect(() =>
      buildErc20TransferBinding({ actionIndex: 0, expected: EXPECTED, required: true, humanOverride: { rawAmount: "59999999999" } }),
    ).toThrow(PostconditionAdapterError);
  });

  it("display text is never authority — the binding itself always reflects the authoritative value, never the override, even when they happen to match", () => {
    const binding = buildErc20TransferBinding({
      actionIndex: 0,
      expected: EXPECTED,
      required: true,
      humanOverride: { recipient: RECIPIENT, rawAmount: "60000000000" },
    });
    expect(binding.bindingParams.find((p) => p.key === "recipient")!.value).toBe(EXPECTED.recipient);
  });
});
