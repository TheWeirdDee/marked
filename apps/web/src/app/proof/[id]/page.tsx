import { notFound } from "next/navigation";
import Link from "next/link";
import { isMarked, type FulfillmentStatus } from "@marked/core";
import { MarkedWordmark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";
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
 * 5/6 evidence). Any other id is looked up in the job store; if that job's
 * status is `FULFILLED_VERIFIED` (never true live in this environment,
 * since no arbitrary proposal reaches KeeperHub here) it would render the
 * same way. Never mutates anything — no ARM/APPROVE/DISARM control exists
 * on this route.
 */
export default async function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "gate6") {
    const { receipt, proof } = loadGate6Receipt();
    if (!receipt || !proof) notFound();
    return <ProofPageBody receiptHash={proof.receiptHash} heroProof={proof} receipt={receipt} />;
  }

  // A job created through /app/new can only ever reach ARMED in this environment (no live
  // KeeperHub execution pipeline for newly-resolved proposals — see the fulfillment detail
  // page's own banner copy), so no stored job's status is ever FULFILLED_VERIFIED. This
  // check is real, not decorative: if a future gate wires up live execution, this path
  // starts working without any change here.
  const store = getAppStore();
  const job = await store.get(id);
  if (job && isMarked(job.status as FulfillmentStatus)) {
    notFound(); // TODO(future gate): render from `job` once a live path can reach FULFILLED_VERIFIED.
  }
  notFound();
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
