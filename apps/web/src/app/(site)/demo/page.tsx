import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";
import { HashChip } from "@/components/ui/HashChip";
import { Section } from "@/components/ui/Section";
import { loadLane1Cactus, loadLane2Gate5, loadGate6Receipt } from "@/lib/evidence";
import { shortenHex } from "@/lib/format";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { HeroSuccess } from "@/components/proof/HeroSuccess";
import { ReceiptView } from "@/components/proof/ReceiptView";
import { Recomputability } from "@/components/proof/Recomputability";
import { Stepper, type StepperStep } from "@/components/demo/Stepper";
import { RefusalGallery } from "@/components/demo/RefusalGallery";
import { Timeline } from "@/components/demo/Timeline";

export const metadata = { title: "Recorded fulfillment" };

function buildSteps(proof5: NonNullable<ReturnType<typeof loadLane2Gate5>["proof"]>, receiptHash: string): StepperStep[] {
  const rawAmount = proof5.commitment.postconditionBindings[0]?.bindingParams.find((p) => p.key === "rawAmount")?.value ?? "0";
  return [
    { label: "Authorization resolved", detail: `Governor ${shortenHex(proof5.commitment.governor)} / proposal #${proof5.commitment.proposalId} — action bundle read directly from the Governor contract.` },
    {
      label: "Marked Agent explains (illustrative)",
      detail: `A live agent would narrate this proposal grounded in the same evidence — e.g. "Governance authorized ${rawAmount} raw units to the recipient in action 0." This replay shows illustrative product copy, not a captured model response — no live model call was made for this recorded step. Try the real live agent at /app/new.`,
    },
    {
      label: "Agent prepares → Marked validates ✓ (illustrative)",
      detail: "The agent would suggest fulfilling action 0; Marked's deterministic validator independently confirms it matches canonical authorization before anything proceeds to human review. See /evidence for the real validator running against real adversarial inputs.",
    },
    { label: "Commitment frozen", detail: `fulfillmentCommitmentHash ${shortenHex(proof5.fulfillmentCommitmentHash)} — the exact reviewed fulfillment, locked.` },
    { label: "Waiting for eligibility", detail: proof5.eligibility.stateLabel + " — Marked waited for the timelock to mature before proceeding." },
    { label: "Simulation passed", detail: proof5.callerCheck.simulationConfirmedNoRevert ? "KeeperHub simulated the exact call — no revert." : "Simulation did not confirm." },
    { label: "Human approved", detail: "Ask me first mode — a human approved this exact frozen commitment before submission." },
    { label: "KeeperHub submitted", detail: `Execution ID ${proof5.execution.executionId}.` },
    { label: "Transaction finalized", detail: `Included at block ${proof5.finality.inclusionBlock}, final at block ${proof5.finality.finalityReachedAtBlock}.` },
    { label: "Governor verified", detail: `Governor state independently re-read: ${proof5.governorAfter.stateLabel} (executed=${String(proof5.governorAfter.executed)}).` },
    { label: "Economic state verified", detail: "Independent block-pinned balance re-derivation matched the authorized amount exactly." },
    {
      label: "Agent explains the receipt (illustrative)",
      detail: "A live agent would narrate the reconciled receipt — authorized, executed, and observed all agreeing. Ask the real agent on the receipt page itself: /proof/gate6.",
    },
    { label: "MARKED ✓", detail: `Receipt ${shortenHex(receiptHash)} — every required fact reconciled.` },
  ];
}

export default function DemoPage() {
  const lane1 = loadLane1Cactus();
  const lane2 = loadLane2Gate5();
  const gate6 = loadGate6Receipt();

  const cactus = lane1.resolved;
  const deployment = lane2.deployment;
  const proof5 = lane2.proof;
  const receipt = gate6.receipt;
  const proof6 = gate6.proof;

  return (
    <main id="main-content" className="bg-texture-quiet">
      <Section className="pb-10 text-center">
        <div className="mb-4 flex justify-center">
          <Badge tone="warn">Recorded real Sepolia fulfillment</Badge>
        </div>
        {proof6 ? <HeroSuccess proof6={proof6} /> : null}
        <p className="mx-auto mt-8 max-w-xl text-[var(--muted-strong)]">
          Governance authorized 1,000 MTGT. KeeperHub executed the Governor lifecycle. Marked independently observed
          exactly 1,000 MTGT arrive. This is a recording of that real proof — nothing on this page is executing now.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <a href="#replay" className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-medium text-black">
            Replay journey
          </a>
          <Link href="/proof/gate6" className="rounded-lg border border-[var(--border-strong)] px-5 py-2.5 text-sm font-medium">
            Inspect receipt →
          </Link>
        </div>
      </Section>

      {proof5 && proof6 ? (
        <Section id="replay" className="border-t border-[var(--border)]">
          <p className="section-label mb-4">Guided replay</p>
          <div className="mx-auto max-w-xl">
            <Stepper steps={buildSteps(proof5, proof6.receiptHash)} />
          </div>
        </Section>
      ) : null}

      {proof5 && receipt ? (
        <Section className="border-t border-[var(--border)]">
          <details>
            <summary className="cursor-pointer font-medium">View complete execution trace</summary>
            <div className="mt-6">
              <Timeline proof5={proof5} receipt={receipt} />
            </div>
          </details>
        </Section>
      ) : null}

      <Section className="border-t border-[var(--border)]">
        <details>
          <summary className="cursor-pointer font-medium">See how Marked fails closed</summary>
          <div className="mt-6">
            <RefusalGallery />
          </div>
        </details>
      </Section>

      {/* --- Mode C, explained after the proof, not before it --- */}
      <Section className="border-t border-[var(--border)]">
        <p className="section-label mb-4">Where Cactus fits</p>
        <p className="max-w-2xl text-[var(--muted-strong)]">
          Marked&apos;s Cactus intake has separately been verified against live Cactus governance objects. New DAO
          submissions are currently paused there, so the KeeperHub execution proof above uses a controlled Sepolia
          Governor instead. These are two separate proofs, sharing one engine, never presented as one proposal.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <CardLabel>Live Cactus governance proof</CardLabel>
              <Badge>Read-only</Badge>
            </div>
            {cactus ? (
              <>
                <p className="text-sm text-[var(--muted-strong)]">{cactus.organization.name}</p>
                <p className="font-medium">
                  Proposal #{cactus.proposal.onchainProposalId} — {cactus.proposal.title}
                </p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <Row label="Chain" value="Ethereum mainnet" />
                  <Row label="Governor" value={<HashChip value={cactus.governor.address} />} />
                  <Row label="Status" value={cactus.proposal.status ?? "unknown"} />
                </div>
                <p className="mt-4 text-xs text-[var(--muted)]">Not executed through KeeperHub.</p>
              </>
            ) : null}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <CardLabel>Controlled KeeperHub fulfillment proof</CardLabel>
              <Badge tone="accent">Executed</Badge>
            </div>
            {deployment && proof5 ? (
              <>
                <p className="text-sm text-[var(--muted-strong)]">Self-deployed Sepolia test fixture</p>
                <p className="font-medium">Proposal #{deployment.proposalId}</p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <Row label="Governor" value={<HashChip value={deployment.governorAddress} />} />
                  <Row label="Mode" value="Ask me first" />
                </div>
                <p className="mt-4 text-xs text-[var(--muted)]">Not Cactus-indexed and not a real DAO.</p>
              </>
            ) : null}
          </Card>
        </div>
      </Section>

      {proof5 ? (
        <Section className="border-t border-[var(--border)]">
          <p className="section-label mb-4">Execution provider</p>
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="accent">KeeperHub</Badge>
              <span className="text-sm text-[var(--muted)]">Option B — direct execute-contract-call</span>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Simulation" value={proof5.callerCheck.simulationConfirmedNoRevert ? "Passed" : "Failed"} />
              <Row label="Execution" value={`Governor.execute(${proof5.commitment.proposalId})`} />
              <Row label="Execution ID" value={<span className="font-mono-num">{proof5.execution.executionId}</span>} />
              <Row
                label="Transaction"
                value={
                  <span className="inline-flex items-center gap-2">
                    <HashChip value={proof5.execution.transactionHash} />
                    <ExplorerLink chainId={proof5.commitment.chainId} type="tx" value={proof5.execution.transactionHash} className="text-xs">
                      View
                    </ExplorerLink>
                  </span>
                }
              />
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              KeeperHub handles the bounded onchain execution. Marked determines whether that execution is permitted
              and verifies the result independently. Marked itself never broadcasts the transaction.
            </p>
          </Card>
        </Section>
      ) : null}

      {receipt && proof6 ? (
        <Section className="border-t border-[var(--border)]">
          <p className="section-label mb-4">Marked Receipt</p>
          <ReceiptView receipt={receipt} proof6={proof6} />
        </Section>
      ) : null}

      <Section className="border-t border-[var(--border)]">
        <Recomputability />
      </Section>

      <Section className="border-t border-[var(--border)] text-center text-xs text-[var(--muted)]">
        The agent prepares. The commitment decides. KeeperHub executes.
      </Section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/50 py-1.5 last:border-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
