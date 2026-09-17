/**
 * Gate 2 live reproduction: resolves Compound #220's authoritative action
 * bundle directly from its Governor Bravo contract (never from Cactus,
 * never from a block explorer's inferred ABI), canonicalizes it, computes
 * the versioned actionAuthorizationHash, reads lifecycle separately, and
 * proves reproducibility by resolving twice.
 *
 * Read-only. No execution, no KeeperHub call, no write of any kind.
 *
 * Run with: pnpm prove:governor
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveGovernorAuthorization,
  freezeAuthorization,
  recheckAuthorization,
  bravoStateLabel,
  bravoLifecycleCallerRequirement,
  planBravoLifecycleCall,
  type GovernorProposalCoordinate,
} from "@marked/governor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "governor", "compound-220");

const COMPOUND_220: GovernorProposalCoordinate = {
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  proposalId: "220",
};

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}
function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n", "utf8");
}

async function main() {
  console.log("MARKED — GOVERNOR AUTHORIZATION ENGINE PROOF (historical, read-only)");
  ensureDir(EVIDENCE_DIR);

  writeJson(join(EVIDENCE_DIR, "coordinate.json"), COMPOUND_220);

  console.log(`\nCoordinate: chainId=${COMPOUND_220.chainId}, governor=${COMPOUND_220.governor}, proposalId=${COMPOUND_220.proposalId}`);

  const first = await resolveGovernorAuthorization(COMPOUND_220);
  console.log(`\nGovernor family: ${first.authorization.governorFamily}`);
  console.log(`Actions: ${first.authorization.actions.length}`);
  for (const action of first.authorization.actions) {
    console.log(`\nAction ${action.actionIndex}:`);
    console.log(`  target: ${action.target}`);
    console.log(`  value: ${action.value}`);
    console.log(`  signature: ${action.signature || "(none — raw calldata)"}`);
    console.log(`  calldata: ${action.calldata}`);
  }
  console.log(`\nAction authorization hash:\n${first.actionAuthorizationHash}`);
  console.log(`\nLifecycle: ${bravoStateLabel(first.lifecycle.state)} (raw state=${first.lifecycle.state})`);
  console.log(`Resolved at block: ${first.resolvedAtBlock}`);

  writeJson(join(EVIDENCE_DIR, "authorization.json"), first.authorization);
  writeJson(join(EVIDENCE_DIR, "lifecycle.json"), first.lifecycle);

  // Reproducibility: resolve a second time, independently.
  console.log("\n[Reproducibility] Resolving a second, independent time...");
  const second = await resolveGovernorAuthorization(COMPOUND_220);
  const reproducible = second.actionAuthorizationHash === first.actionAuthorizationHash;
  console.log(`  First hash:  ${first.actionAuthorizationHash}`);
  console.log(`  Second hash: ${second.actionAuthorizationHash}`);
  console.log(`  Resolved-at block first=${first.resolvedAtBlock} second=${second.resolvedAtBlock} (may legitimately differ)`);
  console.log(`  Result: ${reproducible ? "PASS — identical hash" : "FAIL — hash changed"}`);

  // Freeze + recheck (read-only; no execution).
  const frozen = freezeAuthorization(first);
  const recheck = await recheckAuthorization(frozen, COMPOUND_220);
  console.log(`\n[Freeze/recheck] matches=${recheck.matches}`);

  const callerRequirement = bravoLifecycleCallerRequirement();
  console.log(`\n[Caller authority] model=${callerRequirement.model}`);

  const plan = planBravoLifecycleCall(COMPOUND_220, "execute");

  const proof = {
    coordinate: COMPOUND_220,
    governorFamily: first.authorization.governorFamily,
    actionCount: first.authorization.actions.length,
    actionAuthorizationHash: first.actionAuthorizationHash,
    lifecycle: { state: first.lifecycle.state, stateLabel: bravoStateLabel(first.lifecycle.state) },
    resolvedAtBlock: first.resolvedAtBlock,
    reproducibility: { firstHash: first.actionAuthorizationHash, secondHash: second.actionAuthorizationHash, match: reproducible },
    freezeRecheck: recheck,
    callerAuthority: callerRequirement,
    lifecycleCallPlan: plan,
  };
  writeJson(join(EVIDENCE_DIR, "proof.json"), proof);

  const overallPass = reproducible && recheck.matches;
  console.log(`\nRESULT:\n${overallPass ? "PASS" : "FAIL"}`);
  process.exitCode = overallPass ? 0 : 1;
}

main().catch((err) => {
  console.error("Reproduction script crashed:", err);
  process.exitCode = 1;
});
