import { describe, expect, it } from "vitest";
import { getExplorerUrl, getExplorerName, isExplorerSupportedChain } from "./explorer";

describe("getExplorerUrl", () => {
  it("builds an Ethereum mainnet transaction link", () => {
    expect(getExplorerUrl({ chainId: 1, type: "tx", value: "0xabc" })).toBe("https://etherscan.io/tx/0xabc");
  });

  it("builds a Sepolia address link", () => {
    expect(getExplorerUrl({ chainId: 11155111, type: "address", value: "0xdef" })).toBe("https://sepolia.etherscan.io/address/0xdef");
  });

  it("builds a block link", () => {
    expect(getExplorerUrl({ chainId: 1, type: "block", value: "12345" })).toBe("https://etherscan.io/block/12345");
  });

  it("builds a token link", () => {
    expect(getExplorerUrl({ chainId: 1, type: "token", value: "0x111" })).toBe("https://etherscan.io/token/0x111");
  });

  it("returns null for an unsupported chain rather than a broken link", () => {
    expect(getExplorerUrl({ chainId: 999999, type: "tx", value: "0xabc" })).toBeNull();
  });

  it("returns null for an empty value", () => {
    expect(getExplorerUrl({ chainId: 1, type: "tx", value: "" })).toBeNull();
  });
});

describe("getExplorerName", () => {
  it("names the mainnet explorer", () => {
    expect(getExplorerName(1)).toBe("Etherscan");
  });
  it("names the Sepolia explorer", () => {
    expect(getExplorerName(11155111)).toBe("Sepolia Etherscan");
  });
  it("returns null for an unsupported chain", () => {
    expect(getExplorerName(999999)).toBeNull();
  });
});

describe("isExplorerSupportedChain", () => {
  it("is true for mainnet and Sepolia", () => {
    expect(isExplorerSupportedChain(1)).toBe(true);
    expect(isExplorerSupportedChain(11155111)).toBe(true);
  });
  it("is false for an unsupported chain", () => {
    expect(isExplorerSupportedChain(999999)).toBe(false);
  });
});
