import { describe, expect, it } from "vitest";
import { parseCactusProposalUrl } from "./url";
import { toGovernanceCoordinate, assertNoAuthorityLeak } from "./governance-coordinate";
import type { ResolvedCactusProposal } from "./types";

/**
 * Gate 12 §CACTUS-LIVE-001 — the live-finding investigation's primary
 * hypothesis (raised explicitly, not assumed) was that Marked might lose
 * precision on real Cactus proposal IDs, which are full uint256-scale
 * values (up to 78 decimal digits) — unlike the two Gate 1A fixtures
 * (Compound #220, Uniswap #20), which happen to be small. The actual root
 * cause turned out to be elsewhere (an out-of-sync chain registry — see
 * `evidence/system-audit/cactus-live-compatibility.md`), but this
 * hypothesis was real enough to deserve its own permanent, explicit proof
 * that it is NOT a live bug and never becomes one silently.
 *
 * Every proposalId field in this codebase is typed `string`, end to end
 * (verified by a repo-wide grep during this investigation — zero
 * `number`-typed proposalId fields exist anywhere). `BigInt(...)` is used
 * only at the two points that must convert to a real numeric value for an
 * ABI-encoded on-chain call/hash (`packages/governor`, `packages/core`'s
 * `computeActionAuthorizationHash`) — both of which parse a decimal string
 * exactly, unlike `Number(...)`, which would silently round anything
 * beyond 2^53. This file proves the one hop `packages/cactus` itself owns:
 * URL → `ParsedCactusProposalUrl` → `GovernanceCoordinate`, across a set of
 * boundary values from tiny to the real, exact values found in the field.
 */

const BOUNDARY_IDS = [
  "0",
  "1",
  "220", // the real Compound #220 fixture value
  "9007199254740991", // 2^53 - 1 — the largest integer JS's Number type can represent exactly
  "9007199254740992", // 2^53 — one past that boundary; Number(...) would silently round this
  "115792089237316195423570985008687907853269984665640564039457584007913129639935", // 2^256 - 1 — the maximum possible uint256, the true ceiling for any real onchain proposal id
  "19667497139373951686084433718987773325019389190188449031876262520356769920394", // the real, exact ENS proposal id from this gate's live reproduction
  "47864371633107534187617995773541299064963460661119440983190542488743950169122", // the real, exact Optimism proposal id from this gate's live reproduction
];

describe("proposal id losslessness — URL parsing", () => {
  for (const id of BOUNDARY_IDS) {
    it(`preserves proposal id ${id.length > 20 ? id.slice(0, 12) + "…" : id} exactly through parseCactusProposalUrl`, () => {
      const result = parseCactusProposalUrl(`https://www.tally.xyz/gov/some-dao/proposal/${id}`);
      expect(result.onchainProposalId).toBe(id);
      expect(typeof result.onchainProposalId).toBe("string");
    });
  }
});

describe("proposal id losslessness — toGovernanceCoordinate + JSON round-trip (simulates Server Action serialization and DB JSONB/TEXT persistence)", () => {
  function fixtureFor(proposalId: string): ResolvedCactusProposal {
    return {
      organization: { id: "org-1", slug: "some-dao", name: "Some DAO" },
      proposal: { title: "Test proposal", onchainProposalId: proposalId, url: `https://www.tally.xyz/gov/some-dao/proposal/${proposalId}`, status: "executed" },
      chain: { chainId: 1 },
      governor: { address: "0x0000000000000000000000000000000000000001", kind: "governorbravo" },
      provenance: { endpoint: "https://www.tally.xyz/gov/some-dao/proposal/" + proposalId, fetchedAt: "2026-09-17T00:00:00.000Z", sourceClassification: "CURRENT_CACTUS", resolutionMethod: "ssr_fallback" },
    };
  }

  for (const id of BOUNDARY_IDS) {
    it(`preserves proposal id ${id.length > 20 ? id.slice(0, 12) + "…" : id} exactly through toGovernanceCoordinate and a JSON round-trip`, () => {
      const { coordinate } = toGovernanceCoordinate(fixtureFor(id));
      expect(coordinate.proposalId).toBe(id);
      assertNoAuthorityLeak(coordinate);

      // Simulates crossing a Server Action boundary or a DB JSONB/TEXT column —
      // both are, at bottom, a JSON round trip. A plain string survives this
      // exactly; a number would not for any id beyond 2^53.
      const roundTripped = JSON.parse(JSON.stringify(coordinate));
      expect(roundTripped.proposalId).toBe(id);
      expect(typeof roundTripped.proposalId).toBe("string");
    });
  }

  it("BigInt(proposalId) round-trips back to the exact original decimal string for every boundary value (the one legitimate numeric conversion in this pipeline)", () => {
    for (const id of BOUNDARY_IDS) {
      expect(BigInt(id).toString()).toBe(id);
    }
  });

  it("Number(proposalId) — the unsafe conversion this pipeline never actually performs — would in fact lose precision above 2^53, confirming why BigInt is required, not merely stylistic", () => {
    expect(Number("9007199254740991")).toBe(9007199254740991); // exactly representable
    expect(Number("9007199254740992")).toBe(9007199254740992); // still exact (a power of two)
    // The real failure mode: a value that is NOT exactly representable as a double.
    const realEnsId = "19667497139373951686084433718987773325019389190188449031876262520356769920394";
    expect(Number(realEnsId).toString()).not.toBe(realEnsId); // Number() would corrupt this; BigInt()/string never do
  });
});
