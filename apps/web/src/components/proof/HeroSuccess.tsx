import { Card, CardLabel } from "@/components/ui/Card";
import { HashChip } from "@/components/ui/HashChip";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { formatRawTokenAmount, shortenHex } from "@/lib/format";
import type { Gate6Proof } from "@/lib/evidence";

/** Gate 9R — the three-truths hero, shared between `/demo` and `/proof/[id]`. Every value here is read from real Gate 5/6 evidence; nothing is computed in the browser. */
export function HeroSuccess({ proof6 }: { proof6: Gate6Proof }) {
  return (
    <section className="flex flex-col items-center gap-8 rounded-2xl border border-emerald-800/60 bg-gradient-to-b from-emerald-950/30 to-transparent p-8 text-center sm:p-14">
      <span className="font-display text-6xl font-bold uppercase tracking-tight text-[var(--accent)] sm:text-7xl">MARKED ✓</span>
      <p className="text-lg text-[var(--muted-strong)]">Governance fulfilled and independently verified.</p>

      <div className="mt-2 grid w-full gap-4 text-left sm:grid-cols-3">
        <Card>
          <CardLabel>Authorized</CardLabel>
          <p className="font-mono-num text-xl font-semibold">{formatRawTokenAmount(proof6.decodedAction.rawAmount)} MTGT</p>
          <p className="mt-1 text-sm text-[var(--muted)]">→ {shortenHex(proof6.decodedAction.recipient)}</p>
          <p className="mt-3 text-xs text-[var(--muted)]">Source: Governor proposal {proof6.identity.proposalId}</p>
        </Card>
        <Card>
          <CardLabel>Executed</CardLabel>
          <p className="text-sm">KeeperHub</p>
          <p className="font-mono-num text-sm text-[var(--muted)]">Governor.execute({proof6.identity.proposalId})</p>
          <p className="mt-3 flex flex-wrap items-center gap-2">
            <HashChip value={proof6.identity.executionTxHash} />
            <ExplorerLink chainId={proof6.identity.chainId} type="tx" value={proof6.identity.executionTxHash} className="text-xs">
              View
            </ExplorerLink>
          </p>
        </Card>
        <Card>
          <CardLabel>Observed</CardLabel>
          <p className="text-sm text-[var(--muted)]">
            Before <span className="font-mono-num text-[var(--foreground)]">{formatRawTokenAmount(proof6.postcondition.preState.recipientBalanceBefore)} MTGT</span>
          </p>
          <p className="text-sm text-[var(--muted)]">
            After <span className="font-mono-num text-[var(--foreground)]">{formatRawTokenAmount(proof6.postcondition.observed.recipientBalanceAfter)} MTGT</span>
          </p>
          <p className="mt-2 font-mono-num text-sm font-semibold text-[var(--accent)]">
            Delta +{formatRawTokenAmount(proof6.postcondition.observed.observedDelta)} MTGT ✓
          </p>
        </Card>
      </div>

      <p className="mt-2 font-mono-num text-sm text-[var(--muted)]">Expected = Observed</p>
    </section>
  );
}
