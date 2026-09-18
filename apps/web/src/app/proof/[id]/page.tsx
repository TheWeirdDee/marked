import { notFound } from "next/navigation";
import Link from "next/link";
import { isMarked, type FulfillmentStatus, type MarkedReceipt } from "@marked/core";
import { MarkedWordmark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";
import { HashChip } from "@/components/ui/HashChip";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { HeroSuccess } from "@/components/proof/HeroSuccess";
import { ReceiptView } from "@/components/proof/ReceiptView";
import { Recomputability } from "@/components/proof/Recomputability";
import { loadGate6Receipt } from "@/lib/evidence";
import { getAppStore } from "@/lib/job-store";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { askAboutReceipt } from "@/lib/agent/actions";
import { isAgentAvailable } from "@/lib/agent/provider";

export const metadata = { title: "Verified fulfillment" };

/** Gate 11 §21 — id !== "gate6" reads the job store; never attempt a build-time static render for this route. See apps/web/src/app/app/page.tsx's doc comment for why. */
export const dynamic = "force-dynamic";

/**
 * Gate 9R Part 38 — the public, read-only, shareable receipt page. `id ===
 * "gate6"` serves the one canonical proof this submission has (real Gate
 * 5/6 evidence, rendered with the rich `ReceiptView`/`HeroSuccess`
 * components built specifically for that one static proof's extra debug
 * evidence). Any other id is looked up in the job store; a job that has
 * genuinely reached `FULFILLED_VERIFIED` (or `FULFILLED_UNVERIFIED`) through
 * the live execution pipeline (apps/web/src/lib/execution/) now renders here
 * too, from `job.receipt` — the canonical `MarkedReceipt` fields only, not
 * the richer Gate 6 debug shape (no separate pre-state/observed-balance log
 * was persisted per job; the receipt itself is still the full, real,
 * recomputable Gate 6 artifact). Never mutates anything — no ARM/APPROVE/
 * DISARM control exists on this route.
 */
export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "gate6") {
    const { receipt, proof } = loadGate6Receipt();
    if (!receipt || !proof) notFound();
    return <ProofPageBody receiptHash={proof.receiptHash} heroProof={proof} receipt={receipt} />;
  }

  const store = getAppStore();
  const job = await store.get(id);
  if (!job || !isMarked(job.status as FulfillmentStatus) || !job.receipt) notFound();

  return <LiveReceiptPageBody jobId={id} receipt={job.receipt} />;
}

function LiveReceiptPageBody({ jobId, receipt }: { jobId: string; receipt: MarkedReceipt }) {
  const verified = receipt.status === "FULFILLED_VERIFIED";

  return (
    <main id="main-content" className="mx-auto flex max-w-[1200px] flex-col gap-12 px-6 py-16">
      <header className="flex items-center justify-between">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50">
          <MarkedWordmark />
        </Link>
        <Badge tone={verified ? "accent" : "warn"}>{verified ? "Verified fulfillment" : "Executed — unverified"}</Badge>
      </header>

      <section className={`flex flex-col items-center gap-4 rounded-2xl border p-8 text-center sm:p-14 ${verified ? "border-emerald-800/60 bg-gradient-to-b from-emerald-950/30 to-transparent" : "border-amber-800/40 bg-[var(--warn-dim)]"}`}>
        <span className={`font-display text-5xl font-bold uppercase tracking-tight sm:text-6xl ${verified ? "text-[var(--accent)]" : "text-[var(--muted-strong)]"}`}>
          {verified ? "MARKED ✓" : "Not verified"}
        </span>
        <p className="text-lg text-[var(--muted-strong)]">
          {verified
            ? "Executed via KeeperHub and independently verified against live chain state."
            : "Executed via KeeperHub, but the required economic postcondition did not independently verify."}
        </p>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <section className="min-w-0">
          <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-tight">Marked Receipt</h2>
          <Card>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <CardLabel>Governance</CardLabel>
                <div className="space-y-1.5 text-sm">
                  <ReceiptRow label="Chain" value={String(receipt.chainId)} />
                  <ReceiptRow
                    label="Governor"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <HashChip value={receipt.governor} />
                        <ExplorerLink chainId={receipt.chainId} type="address" value={receipt.governor} className="text-xs">
                          View
                        </ExplorerLink>
                      </span>
                    }
                  />
                  <ReceiptRow label="Proposal" value={receipt.proposalId} />
                  <ReceiptRow label="Action index" value={String(receipt.actionIndex)} />
                  <ReceiptRow label="actionAuthorizationHash" value={<HashChip value={receipt.frozenActionAuthorizationHash} />} />
                </div>
              </div>
              <div>
                <CardLabel>KeeperHub execution</CardLabel>
                <div className="space-y-1.5 text-sm">
                  <ReceiptRow
                    label="Execution tx"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <HashChip value={receipt.executionTxHash} />
                        <ExplorerLink chainId={receipt.chainId} type="tx" value={receipt.executionTxHash} className="text-xs">
                          View
                        </ExplorerLink>
                      </span>
                    }
                  />
                  <ReceiptRow label="Execution block" value={receipt.executionBlock} />
                  <ReceiptRow label="Finality block" value={receipt.finalityBlock} />
                  <ReceiptRow label="Final Governor state" value={`state ${receipt.governorFinalState}${receipt.governorFinalState === 7 ? " (Executed)" : ""}`} />
                </div>
              </div>
              <div>
                <CardLabel>Postcondition</CardLabel>
                <div className="space-y-1.5 text-sm">
                  <ReceiptRow label="Coverage" value={receipt.postconditionCoverage} />
                  <ReceiptRow label="Required assertions verified" value={receipt.requiredAssertionsVerified ? "Yes" : "No"} />
                </div>
              </div>
              <div>
                <CardLabel>Receipt</CardLabel>
                <div className="space-y-1.5 text-sm">
                  <ReceiptRow label="Status" value={<Badge tone={verified ? "accent" : "warn"}>{receipt.status}</Badge>} />
                  <ReceiptRow label="fulfillmentCommitmentHash" value={<HashChip value={receipt.fulfillmentCommitmentHash} />} />
                  <ReceiptRow label="Observed at" value={receipt.observedAt} />
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  A Marked-internal, independently recomputable record — not an onchain transaction hash, so it has no
                  explorer page.
                </p>
              </div>
            </div>
          </Card>
          <Link href={`/app/fulfillments/${jobId}`} className="mt-4 inline-block text-sm text-[var(--muted)] underline">
            ← Back to fulfillment detail
          </Link>
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-8">
          <AgentPanel
            available={isAgentAvailable()}
            title="Explain this receipt"
            suggestedQuestions={["What happened?", "Did the recipient actually receive the tokens?", "What does MARKED ✓ mean here?"]}
            askAction={askAboutReceipt}
          />
          <Recomputability />
        </div>
      </div>
    </main>
  );
}

function ReceiptRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/50 py-1.5 last:border-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ProofPageBody({
  receiptHash,
  heroProof,
  receipt,
}: {
  receiptHash: string;
  heroProof: NonNullable<ReturnType<typeof loadGate6Receipt>["proof"]>;
  receipt: NonNullable<ReturnType<typeof loadGate6Receipt>["receipt"]>;
}) {
  return (
    <main id="main-content" className="mx-auto flex max-w-[1200px] flex-col gap-12 px-6 py-16">
      <header className="flex items-center justify-between">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50">
          <MarkedWordmark />
        </Link>
        <Badge tone="accent">Verified fulfillment</Badge>
      </header>

      <p className="text-sm text-[var(--muted)]">
        Recorded real Sepolia fulfillment — not a live execution. Receipt <span className="font-mono-num">{receiptHash.slice(0, 14)}…</span>
      </p>

      <HeroSuccess proof6={heroProof} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <section className="min-w-0">
          <h2 className="mb-4 font-display text-2xl font-bold uppercase tracking-tight">Marked Receipt</h2>
          <ReceiptView receipt={receipt} proof6={heroProof} />
        </section>

        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-8">
          <AgentPanel
            available={isAgentAvailable()}
            title="Explain this receipt"
            suggestedQuestions={["What happened?", "Did the recipient actually receive the tokens?", "What does MARKED ✓ mean here?"]}
            askAction={askAboutReceipt}
          />
          <Recomputability />
        </div>
      </div>

      <footer className="border-t border-[var(--border)] pt-8 text-center text-xs text-[var(--muted)]">
        <Link href="/docs/receipt-verification" className="underline">
          How to verify this receipt
        </Link>
      </footer>
    </main>
  );
}
