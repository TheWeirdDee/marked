import { describe, expect, it } from "vitest";
import { CactusResolutionError } from "./errors";
import { parseCactusProposalUrl } from "./url";

describe("parseCactusProposalUrl", () => {
  it("parses a valid supported proposal URL", () => {
    const result = parseCactusProposalUrl("https://www.tally.xyz/gov/compound/proposal/220");
    expect(result).toEqual({
      host: "www.tally.xyz",
      organizationSlug: "compound",
      onchainProposalId: "220",
      url: "https://www.tally.xyz/gov/compound/proposal/220",
    });
  });

  it("parses the bare tally.xyz host", () => {
    const result = parseCactusProposalUrl("https://tally.xyz/gov/uniswap/proposal/20");
    expect(result.host).toBe("tally.xyz");
    expect(result.organizationSlug).toBe("uniswap");
    expect(result.onchainProposalId).toBe("20");
  });

  it("rejects an invalid URL string", () => {
    expect(() => parseCactusProposalUrl("not a url")).toThrow(CactusResolutionError);
    try {
      parseCactusProposalUrl("not a url");
    } catch (err) {
      expect((err as CactusResolutionError).code).toBe("CACTUS_URL_INVALID");
    }
  });

  it("rejects a non-https URL", () => {
    expect(() => parseCactusProposalUrl("http://www.tally.xyz/gov/compound/proposal/220")).toThrow(
      CactusResolutionError,
    );
  });

  it("rejects an unsupported host (SSRF boundary)", () => {
    try {
      parseCactusProposalUrl("https://evil.example.com/gov/compound/proposal/220");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CactusResolutionError);
      expect((err as CactusResolutionError).code).toBe("CACTUS_HOST_NOT_ALLOWED");
    }
  });

  it("rejects a host that merely contains an allowlisted host as a substring", () => {
    expect(() => parseCactusProposalUrl("https://www.tally.xyz.evil.com/gov/compound/proposal/220")).toThrow(
      CactusResolutionError,
    );
  });

  it("rejects an unsupported path shape", () => {
    try {
      parseCactusProposalUrl("https://www.tally.xyz/explore");
      expect.unreachable();
    } catch (err) {
      expect((err as CactusResolutionError).code).toBe("CACTUS_URL_INVALID");
    }
  });

  it("rejects a malformed proposal identifier segment", () => {
    expect(() => parseCactusProposalUrl("https://www.tally.xyz/gov/compound/proposal/")).toThrow(
      CactusResolutionError,
    );
  });
});
