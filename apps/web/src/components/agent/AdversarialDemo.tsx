import { validateAgentPlan } from "@marked/core";
import { CandidatePlanView } from "./CandidatePlanView";

/**
 * Gate 10 §10/§23 — not prose *about* the validator's behavior; this
 * component actually calls the real, deployed `validateAgentPlan` against
 * hand-crafted adversarial inputs, server-side, at render time. If a
 * future change to the validator ever weakened it, this demo would show
 * the (wrong) accepted result — it cannot silently drift from reality the
 * way a hard-coded screenshot description could.
 */
const CANONICAL = {
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

const EXAMPLES = [
  {
    title: "Attempt: substitute a different amount",
    candidateRaw: { ...VALID_BASE, amount: "1500000000000000000000" },
  },
  {
    title: "Attempt: substitute a different recipient",
    candidateRaw: { ...VALID_BASE, recipient: "0xDEADBEEFdeadbeefDEADbEEFdeadbeefDEADbeef" },
  },
  {
    title: "Attempt: reference an action that doesn't exist",
    candidateRaw: { ...VALID_BASE, suggestedActionIndexes: [7] },
  },
  {
    title: "Attempt: mark the fulfillment as already executed",
    candidateRaw: { ...VALID_BASE, fulfilled: true },
  },
];

export function AdversarialDemo() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {EXAMPLES.map((ex) => {
        const validation = validateAgentPlan({ candidateRaw: ex.candidateRaw, ...CANONICAL });
        return (
          <div key={ex.title}>
            <p className="mb-2 text-sm font-medium text-[var(--muted-strong)]">{ex.title}</p>
            <CandidatePlanView validation={validation} />
          </div>
        );
      })}
    </div>
  );
}
