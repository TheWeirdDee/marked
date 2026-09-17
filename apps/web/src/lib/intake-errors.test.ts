import { describe, expect, it } from "vitest";
import { CactusResolutionError } from "@marked/cactus";
import { GovernorResolutionError } from "@marked/governor";
import { describeIntakeError } from "./intake-errors";

describe("describeIntakeError", () => {
  it("maps every CactusResolutionError code to a precise, non-empty message", () => {
    const codes = [
      "CACTUS_URL_INVALID",
      "CACTUS_HOST_NOT_ALLOWED",
      "CACTUS_PROPOSAL_NOT_FOUND",
      "CACTUS_AUTH_REQUIRED",
      "CACTUS_RATE_LIMITED",
      "CACTUS_RESPONSE_INVALID",
      "CACTUS_GOVERNOR_MISSING",
      "CACTUS_CHAIN_MISSING",
      "CACTUS_ONCHAIN_ID_MISSING",
      "CACTUS_SOURCE_UNSUPPORTED",
    ] as const;
    for (const code of codes) {
      const message = describeIntakeError(new CactusResolutionError(code, "raw internal message"));
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toBe("raw internal message");
    }
  });

  it("maps every GovernorResolutionError code to a precise, non-empty message", () => {
    const codes = [
      "UNSUPPORTED_CHAIN",
      "GOVERNOR_NOT_FOUND",
      "PROPOSAL_NOT_FOUND",
      "UNSUPPORTED_GOVERNOR_FAMILY",
      "AUTHORIZATION_READ_FAILED",
      "AUTHORIZATION_INVALID",
      "RPC_INCONSISTENT_READ",
    ] as const;
    for (const code of codes) {
      const message = describeIntakeError(new GovernorResolutionError(code, "raw internal message"));
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toBe("raw internal message");
    }
  });

  it("gives a specific message for UNSUPPORTED_GOVERNOR_FAMILY mentioning Governor Bravo", () => {
    const message = describeIntakeError(new GovernorResolutionError("UNSUPPORTED_GOVERNOR_FAMILY", "x"));
    expect(message).toContain("Governor Bravo");
  });

  it("distinguishes a network/RPC failure from other generic errors", () => {
    const message = describeIntakeError(new TypeError("fetch failed"));
    expect(message).toMatch(/network|rpc/i);
  });

  it("falls back to the raw error message for an unrecognized error type", () => {
    expect(describeIntakeError(new Error("something else broke"))).toBe("something else broke");
  });

  it("never throws for a non-Error value", () => {
    expect(describeIntakeError("a plain string")).toBe("Resolution failed for an unknown reason.");
    expect(describeIntakeError(null)).toBe("Resolution failed for an unknown reason.");
  });
});
