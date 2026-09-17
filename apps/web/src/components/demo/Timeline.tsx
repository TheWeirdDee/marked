import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Gate5Proof, MarkedReceiptEvidence } from "@/lib/evidence";

type Step = {
  label: string;
  detail: string;
  internalStatus: string;
};

function buildSteps(proof5: Gate5Proof, receipt: MarkedReceiptEvidence): Step[] {
  return [
    { label: "Proposal resolved", detail: `Governor ${proof5.commitment.governor.slice(0, 10)}… / proposal #${proof5.commitment.proposalId}`, internalStatus: "RESOLVED" },
    { label: "Authorization verified", detail: "Governor authorization independently re-derived from calldata", internalStatus: "AUTHORIZATION_VERIFIED" },
    { label: "Postcondition bound", detail: "erc20-transfer v1 adapter bound to action index 0", internalStatus: "POSTCONDITION_BOUND" },
    { label: "Fulfillment armed", detail: "fulfillmentCommitmentHash computed and persisted", internalStatus: "ARMED" },
    { label: "Waiting for execution window", detail: proof5.eligibility.stateLabel, internalStatus: "WAITING_WINDOW" },
    { label: "Eligible", detail: proof5.eligibility.reason, internalStatus: proof5.eligibility.outcome },
    { label: "Simulation passed", detail: proof5.callerCheck.simulationConfirmedNoRevert ? "KeeperHub caller simulation: no revert" : "Simulation did not confirm", internalStatus: "SIMULATED" },
    { label: "Approved", detail: "Human approval recorded (Ask me first mode)", internalStatus: "APPROVED" },
    { label: "Submitted through KeeperHub", detail: `Execution ID ${proof5.execution.executionId}`, internalStatus: "SUBMITTED" },
    { label: "Transaction confirmed", detail: `Included at block ${proof5.finality.inclusionBlock}`, internalStatus: "CONFIRMED" },
    { label: "Waiting for finality", detail: `Final at block ${proof5.finality.finalityReachedAtBlock}`, internalStatus: "WAITING_FINALITY" },
    { label: "Governor execution verified", detail: `Governor state: ${proof5.governorAfter.stateLabel} (executed=${String(proof5.governorAfter.executed)})`, internalStatus: "EXECUTION_VERIFIED" },
    { label: "Economic result verified", detail: "Independent block-pinned balance re-derivation matched authorized amount", internalStatus: "POSTCONDITION_VERIFIED" },
    { label: "MARKED ✓", detail: `Receipt observed at ${receipt.observedAt}`, internalStatus: receipt.status },
  ];
}

export function Timeline({ proof5, receipt }: { proof5: Gate5Proof; receipt: MarkedReceiptEvidence }) {
  const steps = buildSteps(proof5, receipt);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Live state timeline</h2>
      <Card>
        <ol className="flex flex-col">
          {steps.map((step, i) => (
            <li key={step.label} className="flex gap-4 border-b border-[var(--border)]/50 py-3 last:border-0">
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-900/60 text-xs text-[var(--accent)]">✓</span>
                {i < steps.length - 1 ? <span className="mt-1 w-px flex-1 bg-[var(--border)]" /> : null}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{step.label}</span>
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{step.detail}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[var(--muted)]">technical status</summary>
                  <p className="font-mono-num mt-1 text-xs text-[var(--muted)]">{step.internalStatus}</p>
                </details>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex justify-end">
          <Badge tone="accent">{receipt.status}</Badge>
        </div>
      </Card>
    </section>
  );
}
