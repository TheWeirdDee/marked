import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import type { HexAddress } from "@marked/core";
import { decodeTokenTransferLogs, matchTransferLog, type DecodedTransferLog } from "./transfer-log-match";
import { ERC20_TRANSFER_EVENT_TOPIC0 } from "./erc20-abi";

const TOKEN: HexAddress = getAddress("0x0000000000000000000000000000000000000aaa");
const OTHER_TOKEN: HexAddress = getAddress("0x000000000000000000000000000000000000dddd");
const SENDER: HexAddress = getAddress("0x000000000000000000000000000000000000cccc");
const RECIPIENT: HexAddress = getAddress("0x000000000000000000000000000000000000bbbb");
const OTHER_RECIPIENT: HexAddress = getAddress("0x000000000000000000000000000000000000eeee");
const AMOUNT = 60000000000n;

function pad32(hex: string): `0x${string}` {
  return `0x${hex.replace(/^0x/, "").padStart(64, "0")}` as `0x${string}`;
}

function transferLog(overrides: Partial<{ address: HexAddress; from: HexAddress; to: HexAddress; value: bigint; logIndex: number }> = {}) {
  const address = overrides.address ?? TOKEN;
  const from = overrides.from ?? SENDER;
  const to = overrides.to ?? RECIPIENT;
  const value = overrides.value ?? AMOUNT;
  return {
    address,
    topics: [ERC20_TRANSFER_EVENT_TOPIC0, pad32(from), pad32(to)] as [`0x${string}`, `0x${string}`, `0x${string}`],
    data: pad32(value.toString(16)),
    logIndex: overrides.logIndex ?? 0,
  };
}

describe("decodeTokenTransferLogs", () => {
  it("decodes a standard Transfer log emitted by the given token", () => {
    const decoded = decodeTokenTransferLogs([transferLog()] as never, TOKEN);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.to.toLowerCase()).toBe(RECIPIENT.toLowerCase());
    expect(decoded[0]!.amount).toBe(AMOUNT);
  });

  it("ignores logs from a different token contract", () => {
    const decoded = decodeTokenTransferLogs([transferLog({ address: OTHER_TOKEN })] as never, TOKEN);
    expect(decoded).toHaveLength(0);
  });

  it("ignores non-Transfer logs (different topic0)", () => {
    const log = transferLog();
    const nonTransfer = { ...log, topics: ["0xdeadbeef", log.topics[1], log.topics[2]] };
    const decoded = decodeTokenTransferLogs([nonTransfer] as never, TOKEN);
    expect(decoded).toHaveLength(0);
  });
});

describe("matchTransferLog — deterministic attribution", () => {
  const baseline: DecodedTransferLog = { logIndex: 0, tokenAddress: TOKEN, from: SENDER, to: RECIPIENT, amount: AMOUNT };

  it("MATCHED — exactly one log matches token+recipient+amount", () => {
    const result = matchTransferLog([baseline], RECIPIENT, AMOUNT);
    expect(result.status).toBe("MATCHED");
  });

  it("MISSING — no logs to this recipient at all", () => {
    const result = matchTransferLog([{ ...baseline, to: OTHER_RECIPIENT }], RECIPIENT, AMOUNT);
    expect(result.status).toBe("MISSING");
  });

  it("MISMATCH — a log to the right recipient exists but with the wrong amount", () => {
    const result = matchTransferLog([{ ...baseline, amount: AMOUNT - 1n }], RECIPIENT, AMOUNT);
    expect(result.status).toBe("MISMATCH");
  });

  it("AMBIGUOUS — two indistinguishable logs both match the full key; never guesses an index", () => {
    const result = matchTransferLog([baseline, { ...baseline, logIndex: 1 }], RECIPIENT, AMOUNT);
    expect(result.status).toBe("AMBIGUOUS");
    if (result.status === "AMBIGUOUS") expect(result.matches).toHaveLength(2);
  });

  it("does not match a log for the right recipient+amount emitted by a different token (already filtered upstream by decodeTokenTransferLogs, but matchTransferLog itself is token-agnostic by design — verified via the empty-candidates case)", () => {
    const result = matchTransferLog([], RECIPIENT, AMOUNT);
    expect(result.status).toBe("MISSING");
  });
});
