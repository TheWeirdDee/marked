/**
 * Gate 4 live reproduction: builds a real `FulfillmentCommitment` and
 * computes its `fulfillmentCommitmentHash`, using genuinely live-proven
 * building blocks from earlier gates:
 *
 *  - `frozenActionAuthorizationHash` comes from a live re-resolution of
 *    Compound #220 (Gate 2's proven fixture) — real chain reads, not a
 *    hardcoded string.
 *  - the postcondition binding's token/recipient/amount reuse the exact
 *    real values from Gate 3's live-proven historical USDC transfer.
 *
 * COMPOSED EXAMPLE — NOT A LIVE OBSERVATION. Compound #220's two actual
 * authorized actions (`setTargetReserves`, `deployAndUpgradeTo`) are not
 * ERC20 transfers, so this script does NOT claim Compound #220 authorized
 * this transfer. It illustrates, with two independently real and
 * independently proven inputs, how a `FulfillmentCommitment` binds a
 * frozen Governor authorization to a postcondition. This commitment is
 * never armed, approved, disarmed, or persisted anywhere beyond this
 * script's own evidence output — Gate 4 proves the commitment/hash
 * mechanism, not a real fulfillment.
 *
 * Read-only. No execution, no KeeperHub call, no write of any kind.
 *
 * Run with: pnpm prove:fulfillment-commitment
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGovernorAuthorization, type GovernorProposalCoordinate } from "@marked/governor";
import { buildErc20TransferBinding, type Erc20TransferExpectedState } from "@marked/postconditions";
import {
  computeFulfillmentCommitmentHash,
  createReviewReadyJob,
  type FulfillmentCommitment,
} from "@marked/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "fulfillment-commitment");

const COMPOUND_220: GovernorProposalCoordinate = {
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  proposalId: "220",
};

// Gate 3's real, live-proven historical USDC transfer fixture values — reused here only as illustrative postcondition numbers, not as a claim about what Compound #220 authorized.
const EXAMPLE_EXPECTED: Erc20TransferExpectedState = {
  token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  recipient: "0x59E0cDA5922eFbA00a57794faF09BF6252d64126",
  authorizedAmount: 60000000000n,
  expectedRecipientBalanceAfter: 1216027789181n,
};

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}
function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n", "utf8");
}

async function main() {
  console.log("MARKED — FULFILLMENT COMMITMENT PROOF");
  console.log("COMPOSED EXAMPLE — not a live observation. See file header.\n");
  ensureDir(EVIDENCE_DIR);

  console.log("Resolving Compound #220's live Governor authorization (Gate 2 seam, re-exercised)...");
  const resolved = await resolveGovernorAuthorization(COMPOUND_220);
  console.log("frozenActionAuthorizationHash:", resolved.actionAuthorizationHash);
  console.log(
    resolved.actionAuthorizationHash === "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d"
      ? "[Gate 2 regression] PASS — unchanged from the frozen Gate 2 evidence hash"
      : "[Gate 2 regression] FAIL — hash differs from the frozen Gate 2 evidence hash",
  );

  const binding = buildErc20TransferBinding({ actionIndex: 0, expected: EXAMPLE_EXPECTED, required: true });
  console.log("\nPostcondition binding (illustrative):", JSON.stringify(binding, null, 2));

  const commitment: FulfillmentCommitment = {
    version: 1,
    chainId: COMPOUND_220.chainId,
    governor: COMPOUND_220.governor,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: COMPOUND_220.proposalId,
    frozenActionAuthorizationHash: resolved.actionAuthorizationHash,
    selectedActionIndexes: [0],
    postconditionBindings: [binding],
    fulfillmentMode: "APPROVE",
    executionSurfaceId: "keeperhub-direct-contract-call-v1",
    executionPolicyVersion: "1",
  };

  function runOnce(label: string) {
    const hash = computeFulfillmentCommitmentHash(commitment);
    console.log(`\n[${label}] fulfillmentCommitmentHash:`, hash);
    return hash;
  }

  const first = runOnce("Run 1");
  const second = runOnce("Run 2 (reproducibility check, same process)");
  const reproducible = first === second;
  console.log("\n[Reproducibility]", reproducible ? "PASS — identical hash" : "FAIL — hash changed");

  const job = createReviewReadyJob({ jobId: "example-job-1", commitment, now: new Date().toISOString() });
  console.log("\n[Job assembly] REVIEW_READY job created, status:", job.status, "hash:", job.fulfillmentCommitmentHash);
  console.log("This job is NOT armed, approved, or executed by this script — see file header.");

  writeJson(join(EVIDENCE_DIR, "example-commitment.json"), commitment);
  writeJson(join(EVIDENCE_DIR, "proof.json"), {
    frozenActionAuthorizationHash: resolved.actionAuthorizationHash,
    gate2RegressionPass: resolved.actionAuthorizationHash === "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
    postconditionBinding: binding,
    commitment,
    fulfillmentCommitmentHash: first,
    reproducibility: { run1: first, run2: second, match: reproducible },
    reviewReadyJob: job,
    note: "COMPOSED EXAMPLE — not a live observation. Compound #220 did not actually authorize an ERC20 transfer; this commitment illustrates the mechanism only and was never armed, approved, or executed.",
  });

  const pass = reproducible && resolved.actionAuthorizationHash === "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d";
  console.log("\nRESULT:", pass ? "PASS" : "FAIL");
  process.exitCode = pass ? 0 : 1;
}

main().catch((err) => {
  console.error("Reproduction script crashed:", err);
  process.exitCode = 1;
});
