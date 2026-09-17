import { describe, expect, it } from "vitest";
import { resolveCactusProposal } from "./index";

/**
 * Gate 12 CACTUS-LIVE-001 — a real, live network test against the exact
 * URLs this gate's investigation used, run against this package's real
 * exported resolver, not a re-implementation. Deliberately NOT part of the
 * ordinary `pnpm test` path — it makes real outbound HTTP calls to live
 * Cactus/Tally infrastructure, which `pnpm test` must never require (this
 * project's own standing discipline, matching the destructive-DB-test
 * guard in packages/db/src/live-postgres-test-guard.ts). Opt in explicitly:
 *
 *   MARKED_RUN_LIVE_CACTUS_TESTS=true pnpm --filter @marked/cactus test
 *
 * Without that flag, every test below is an explicit, descriptive skip —
 * never a silent pass and never a network call.
 */
const LIVE = process.env["MARKED_RUN_LIVE_CACTUS_TESTS"] === "true";
const describeLive = LIVE ? describe : describe.skip;

describeLive("live Cactus resolution — real network calls (Gate 12 CACTUS-LIVE-001)", () => {
  it("resolves the Gate 1A Compound #220 fixture", async () => {
    const { resolved } = await resolveCactusProposal({ proposalUrl: "https://www.tally.xyz/gov/compound/proposal/220" });
    expect(resolved.governor.address.toLowerCase()).toBe("0xc0da02939e1441f497fd74f78ce7decb17b66529");
    expect(resolved.proposal.onchainProposalId).toBe("220");
  }, 30_000);

  it("resolves the Gate 1A Uniswap #20 fixture", async () => {
    const { resolved } = await resolveCactusProposal({ proposalUrl: "https://www.tally.xyz/gov/uniswap/proposal/20" });
    expect(resolved.governor.address.toLowerCase()).toBe("0x408ed6354d4973f66138c91495f2f2fcbd8724c3");
    expect(resolved.proposal.onchainProposalId).toBe("20");
  }, 30_000);

  it("resolves the real ENS proposal with its full-precision uint256 id, never truncated", async () => {
    const id = "19667497139373951686084433718987773325019389190188449031876262520356769920394";
    const { resolved } = await resolveCactusProposal({ proposalUrl: `https://www.tally.xyz/gov/ens/proposal/${id}` });
    expect(resolved.proposal.onchainProposalId).toBe(id);
    expect(resolved.governor.kind).toBe("openzeppelingovernor");
  }, 30_000);

  it("resolves the real Optimism proposal with its full-precision uint256 id and chain 10, never truncated", async () => {
    const id = "47864371633107534187617995773541299064963460661119440983190542488743950169122";
    const { resolved } = await resolveCactusProposal({ proposalUrl: `https://www.tally.xyz/gov/optimism/proposal/${id}` });
    expect(resolved.proposal.onchainProposalId).toBe(id);
    expect(resolved.chain.chainId).toBe(10);
    expect(resolved.organization.isPaused).toBe(true);
  }, 30_000);
});

if (!LIVE) {
  describe("live Cactus resolution — skipped by default", () => {
    it.skip("SKIPPED — set MARKED_RUN_LIVE_CACTUS_TESTS=true to run real network calls against live Cactus infrastructure (see this file's own header comment).", () => {
      // intentionally empty — the skip reason is the point
    });
  });
}
