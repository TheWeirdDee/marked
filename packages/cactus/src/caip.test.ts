import { describe, expect, it } from "vitest";
import { parseEip155GovernorId } from "./caip";
import { CactusResolutionError } from "./errors";

describe("parseEip155GovernorId", () => {
  it("parses a valid eip155 governor id", () => {
    const result = parseEip155GovernorId("eip155:1:0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
    expect(result.chainId).toBe(1);
    expect(result.address).toBe("0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
  });

  it("rejects a malformed address", () => {
    expect(() => parseEip155GovernorId("eip155:1:not-an-address")).toThrow(CactusResolutionError);
  });

  it("rejects a missing chain id", () => {
    expect(() => parseEip155GovernorId("eip155::0xc0Da02939E1441F497fd74F78cE7Decb17B66529")).toThrow(
      CactusResolutionError,
    );
  });

  it("rejects a non-eip155 namespace", () => {
    expect(() => parseEip155GovernorId("solana:1:abc")).toThrow(CactusResolutionError);
  });

  it("rejects a completely malformed id", () => {
    expect(() => parseEip155GovernorId("garbage")).toThrow(CactusResolutionError);
  });
});
