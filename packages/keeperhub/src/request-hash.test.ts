import { describe, expect, it } from "vitest";
import { hashContractCall } from "./request-hash";
import type { FrozenContractCall } from "./types";

const BASE_CALL: FrozenContractCall = {
  chainId: 11155111,
  contractAddress: "0x0000000000000000000000000000000000000001",
  calldata: "0xdeadbeef",
  value: "0",
  abi: [{ type: "function", name: "ping", inputs: [], outputs: [], stateMutability: "nonpayable" }],
};

describe("hashContractCall", () => {
  it("is deterministic for the same call", () => {
    expect(hashContractCall(BASE_CALL)).toBe(hashContractCall({ ...BASE_CALL }));
  });

  it("changes when calldata changes by one byte", () => {
    const mutated = { ...BASE_CALL, calldata: "0xdeadbeee" as const };
    expect(hashContractCall(mutated)).not.toBe(hashContractCall(BASE_CALL));
  });

  it("changes when value changes", () => {
    const mutated = { ...BASE_CALL, value: "1" };
    expect(hashContractCall(mutated)).not.toBe(hashContractCall(BASE_CALL));
  });

  it("changes when chainId changes", () => {
    const mutated = { ...BASE_CALL, chainId: 1 };
    expect(hashContractCall(mutated)).not.toBe(hashContractCall(BASE_CALL));
  });

  it("changes when contractAddress changes", () => {
    const mutated = { ...BASE_CALL, contractAddress: "0x0000000000000000000000000000000000000002" as const };
    expect(hashContractCall(mutated)).not.toBe(hashContractCall(BASE_CALL));
  });

  it("changes when the ABI changes, even with identical calldata/target/value", () => {
    const mutated = { ...BASE_CALL, abi: [{ type: "function", name: "other", inputs: [], outputs: [], stateMutability: "nonpayable" }] };
    expect(hashContractCall(mutated)).not.toBe(hashContractCall(BASE_CALL));
  });

  it("is case-insensitive for address and calldata (normalizes before hashing)", () => {
    const upper = { ...BASE_CALL, contractAddress: "0x0000000000000000000000000000000000000001" as const, calldata: "0xDEADBEEF" as const };
    expect(hashContractCall(upper)).toBe(hashContractCall(BASE_CALL));
  });
});
