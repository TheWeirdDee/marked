/**
 * Gate 1C cross-seam reproduction: Cactus URL -> GovernanceCoordinate ->
 * independent RPC verification. Formalizes the onchain check
 * scripts/prove-cactus-seam.ts already did in Gate 1A, through the new
 * typed boundary added in Gate 1C (packages/cactus's GovernanceCoordinate,
 * packages/governor's verifyGovernorProposalExists).
 *
 * This does NOT extract an action bundle and does NOT execute anything —
 * it only proves the coordinate is real and matches, per Gate 1C
 * instructions §20.
 *
 * Run with: pnpm prove:closed-loop
 */
import { resolveCactusProposal, toGovernanceCoordinate } from "@marked/cactus";
import { verifyGovernorProposalExists } from "@marked/governor";

const FIXTURES = [
  { label: "Compound #220", url: "https://www.tally.xyz/gov/compound/proposal/220" },
  { label: "Uniswap #20", url: "https://www.tally.xyz/gov/uniswap/proposal/20" },
];

async function main() {
  console.log("MARKED — CLOSED-LOOP CROSS-SEAM PROOF (Cactus coordinate -> independent RPC)");
  let matchCount = 0;

  for (const fixture of FIXTURES) {
    console.log(`\n[${fixture.label}]`);
    try {
      const { resolved } = await resolveCactusProposal({ proposalUrl: fixture.url });
      const { coordinate, evidence } = toGovernanceCoordinate(resolved);
      console.log(`  Cactus URL: ${coordinate.cactusUrl}`);
      console.log(`  Coordinate: chainId=${coordinate.chainId}, governor=${coordinate.governor}, proposalId=${coordinate.proposalId}`);
      console.log(`  Provenance: ${evidence.resolutionMethod} @ ${evidence.resolvedAt}`);

      const check = await verifyGovernorProposalExists({
        chainId: coordinate.chainId,
        governor: coordinate.governor,
        proposalId: coordinate.proposalId,
      });

      if (check.ok) {
        console.log(`  Independent RPC: contract exists, state(${coordinate.proposalId}) = ${check.state}`);
        console.log("  Result: MATCH");
        matchCount++;
      } else {
        console.log(`  Independent RPC FAILED: ${check.reason}`);
        console.log("  Result: MISMATCH");
      }
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nGate result:\n${matchCount}/${FIXTURES.length} coordinates matched independently`);
  process.exitCode = matchCount === FIXTURES.length ? 0 : 1;
}

main().catch((err) => {
  console.error("Reproduction script crashed:", err);
  process.exitCode = 1;
});
