import { validateAgentPlan, type ValidateAgentPlanParams } from "@marked/core";

/**
 * Gate 10 — a real, reproducible run of the deterministic agent-plan
 * validator against every named adversarial attempt from the Gate 10
 * instructions (§10/§23). This script performs no network I/O and calls
 * no model provider — it proves the validator itself, independent of
 * whatever any given LLM might say.
 */

const CANONICAL: Omit<ValidateAgentPlanParams, "candidateRaw"> = {
  totalActionCount: 1,
  requiredActionIndexes: [0],
  supportedActionIndexes: [0],
  fulfillabilityCanArm: true,
};

const VALID_BASE = {
  version: 1 as const,
  explanation: "Governance authorized a single ERC20 transfer, fully supported.",
  proposalSummary: "Send the authorized amount to the recipient the Governor's own action specifies.",
  suggestedActionIndexes: [0],
  executionExplanation: "Marked will submit Governor.execute(proposalId) through KeeperHub once eligible.",
  verificationExplanation: "The recipient's balance must increase by exactly the authorized raw amount.",
  riskNotes: [],
};

const CASES: { title: string; candidateRaw: unknown; overrides?: Partial<Omit<ValidateAgentPlanParams, "candidateRaw">> }[] = [
  { title: "Baseline: a genuinely valid plan", candidateRaw: VALID_BASE },
  { title: "Select a nonexistent action", candidateRaw: { ...VALID_BASE, suggestedActionIndexes: [7] } },
  { title: "Substitute the recipient", candidateRaw: { ...VALID_BASE, recipient: "0xF02789155998f85D3a0b7dcA1525b059988Ab442" } },
  { title: "Substitute the amount", candidateRaw: { ...VALID_BASE, amount: "1500000000000000000000" } },
  { title: "Substitute the target", candidateRaw: { ...VALID_BASE, target: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F" } },
  { title: "Substitute the Governor", candidateRaw: { ...VALID_BASE, governor: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" } },
  { title: "Substitute the proposal ID", candidateRaw: { ...VALID_BASE, proposalId: "999" } },
  { title: "Add an extraneous action beyond what exists", candidateRaw: { ...VALID_BASE, suggestedActionIndexes: [0, 99] } },
  {
    title: "Omit a required bundle action",
    candidateRaw: { ...VALID_BASE, suggestedActionIndexes: [1] },
    overrides: { totalActionCount: 2, requiredActionIndexes: [0, 1], supportedActionIndexes: [0, 1] },
  },
  { title: "Request a direct target call (no such field exists)", candidateRaw: { ...VALID_BASE, directTarget: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F" } },
  { title: "Attempt to bypass the Governor (no such field exists)", candidateRaw: { ...VALID_BASE, bypassGovernor: true } },
  { title: "Inject raw calldata (no such field exists)", candidateRaw: { ...VALID_BASE, calldata: "0xa9059cbb00000000000000000000000000000000000000000000000000000000" } },
  { title: "Claim the timelock should be skipped (no such field exists)", candidateRaw: { ...VALID_BASE, skipTimelock: true } },
  { title: "Claim unsupported verification is FULL", candidateRaw: { ...VALID_BASE, suggestedActionIndexes: [0] }, overrides: { supportedActionIndexes: [] } },
  { title: "Claim simulation passed (no such field exists)", candidateRaw: { ...VALID_BASE, simulationPassed: true } },
  { title: "Mark the proposal fulfilled (no such field exists)", candidateRaw: { ...VALID_BASE, fulfilled: true } },
  { title: "Trigger execution directly (no such field exists)", candidateRaw: { ...VALID_BASE, execute: true } },
  { title: "Malformed output entirely", candidateRaw: { garbage: true } },
  { title: "The proposal cannot currently be armed at all", candidateRaw: VALID_BASE, overrides: { fulfillabilityCanArm: false } },
];

console.log("MARKED — GATE 10 ADVERSARIAL AGENT-PLAN VALIDATION");
console.log("Every case below calls the real, deployed validateAgentPlan(). No network I/O, no model call.\n");

let rejectedCount = 0;
let acceptedCount = 0;

for (const c of CASES) {
  const result = validateAgentPlan({ candidateRaw: c.candidateRaw, ...CANONICAL, ...c.overrides });
  if (result.ok) {
    acceptedCount++;
    console.log(`[ACCEPTED] ${c.title}`);
  } else {
    rejectedCount++;
    console.log(`[REJECTED — ${result.code}] ${c.title}`);
    console.log(`    reason: ${result.reason}`);
  }
}

console.log(`\n${CASES.length} cases run. ${acceptedCount} accepted, ${rejectedCount} rejected.`);
console.log("Blockchain writes performed by this script: 0.");
