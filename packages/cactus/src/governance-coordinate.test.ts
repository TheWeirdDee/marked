import { describe, expect, it } from "vitest";
import { assertNoAuthorityLeak, toGovernanceCoordinate } from "./governance-coordinate";
import type { ResolvedCactusProposal } from "./types";

const RESOLVED: ResolvedCactusProposal = {
  organization: { id: "org1", slug: "compound", name: "Compound" },
  proposal: {
    title: "[Gauntlet] 2023-02-26: Ethereum v3 USDC - targetReserves Recommendations",
    onchainProposalId: "220",
    url: "https://www.tally.xyz/gov/compound/proposal/220",
    status: "executed",
  },
  chain: { chainId: 1 },
  governor: { address: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529", kind: "governorbravo" },
  provenance: {
    endpoint: "https://www.tally.xyz/gov/compound/proposal/220",
    fetchedAt: "2026-09-15T09:19:36.127Z",
    sourceClassification: "CURRENT_CACTUS",
    resolutionMethod: "ssr_fallback",
  },
};

describe("toGovernanceCoordinate", () => {
  it("maps a Cactus URL to the exact GovernanceCoordinate", () => {
    const { coordinate } = toGovernanceCoordinate(RESOLVED);
    expect(coordinate).toEqual({
      source: "CACTUS",
      cactusUrl: "https://www.tally.xyz/gov/compound/proposal/220",
      chainId: 1,
      governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
      proposalId: "220",
    });
  });

  it("retains provenance separately from the coordinate", () => {
    const { evidence } = toGovernanceCoordinate(RESOLVED);
    expect(evidence).toEqual({
      sourceUrl: "https://www.tally.xyz/gov/compound/proposal/220",
      resolutionMethod: "ssr_fallback",
      resolvedAt: "2026-09-15T09:19:36.127Z",
    });
  });

  it("never carries organization/title/status — only the coordinate itself", () => {
    const { coordinate } = toGovernanceCoordinate(RESOLVED);
    expect("title" in coordinate).toBe(false);
    expect("organization" in coordinate).toBe(false);
    expect("status" in coordinate).toBe(false);
  });

  it("produces a coordinate with no authority-leak fields (Cactus identifies, never authorizes)", () => {
    const { coordinate } = toGovernanceCoordinate(RESOLVED);
    expect(() => assertNoAuthorityLeak(coordinate)).not.toThrow();
  });
});

describe("assertNoAuthorityLeak", () => {
  it("passes for a clean coordinate", () => {
    expect(() => assertNoAuthorityLeak({ source: "CACTUS", cactusUrl: "x", chainId: 1, governor: "0x1", proposalId: "1" })).not.toThrow();
  });

  it("throws if a forbidden authority-shaped field is present", () => {
    for (const key of ["authorizedCalldata", "executionCalldata", "trustedActions", "canonicalAuthorizationHash", "targets", "values", "signatures", "calldatas"]) {
      expect(() => assertNoAuthorityLeak({ [key]: "anything" })).toThrow(/never carry/);
    }
  });
});
