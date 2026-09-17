import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";
import { Section, SectionHeading } from "@/components/ui/Section";
import { GATE_CARDS, NOT_CLAIMED, type ClaimStatus } from "@/lib/claims-registry";
import { RecoverySandbox } from "@/components/demo/RecoverySandbox";
import { AdversarialDemo } from "@/components/agent/AdversarialDemo";
import { HISTORICAL_BASELINE_SUMMARY as HB } from "@/lib/historical-baseline-summary";

export const metadata = { title: "Evidence" };

const STATUS_TONE: Record<ClaimStatus, "accent" | "warn" | "danger" | "neutral"> = {
  PROVEN: "accent",
  TARGET: "warn",
  BLOCKED: "danger",
  REJECTED: "neutral",
};

const TOC = [
  { href: "#proof-map", label: "Proof map" },
  { href: "#historical-baseline", label: "Historical baseline" },
  { href: "#claim-discipline", label: "Claim discipline" },
  { href: "#agent-boundary", label: "Agent boundary" },
  { href: "#live-sandbox", label: "Live sandbox" },
];

export default function EvidencePage() {
  return (
    <main id="main-content" className="bg-texture-quiet">
      <Section className="pb-10">
        <p className="section-label mb-4">Technical evidence</p>
        <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl">Evidence, not claims.</h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--muted-strong)]">
          Every load-bearing claim in Marked should point to something reproducible.
        </p>
        <nav aria-label="Evidence sections" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--border)] pt-6">
          {TOC.map((t) => (
            <a key={t.href} href={t.href} className="text-sm text-[var(--muted-strong)] underline-offset-4 transition hover:text-[var(--accent)] hover:underline">
              {t.label}
            </a>
          ))}
        </nav>
      </Section>

      <Section id="proof-map" className="border-t border-[var(--border)]">
        <SectionHeading index="—" eyebrow="By gate" title="What was proven, gate by gate." />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {GATE_CARDS.map((c) => (
            <Card key={c.gate}>
              <div className="mb-2 flex items-center justify-between">
                <CardLabel>{c.gate}</CardLabel>
                <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              </div>
              <p className="mb-2 font-medium">{c.title}</p>
              <p className="text-sm text-[var(--muted-strong)]">{c.summary}</p>
              <div className="mt-4 flex flex-col gap-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                {c.evidence.map((e) => (
                  <span key={e} className="font-mono-num">
                    {e}
                  </span>
                ))}
                {c.reproduceCommand ? <span className="font-mono-num text-[var(--accent)]">{c.reproduceCommand}</span> : null}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                <span className="font-medium">Limitation:</span> {c.limitation}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="historical-baseline" className="border-t border-[var(--border)]">
        <SectionHeading
          index="—"
          eyebrow="Gate 8"
          title="Passed ≠ Executed, measured."
          lead="Every executed Compound + Uniswap Governor Bravo proposal on Ethereum mainnet, from execution-eligible (Timelock eta) to actually executed. Timing only — no claim about why any gap happened, or that Marked would have closed it sooner."
        />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Card>
            <CardLabel>Dataset</CardLabel>
            <p className="mt-2 text-3xl font-bold">{HB.totalIncluded}</p>
            <p className="text-sm text-[var(--muted-strong)]">executed proposals included ({HB.compoundIncluded} Compound, {HB.uniswapIncluded} Uniswap)</p>
            <p className="mt-3 text-xs text-[var(--muted)]">{HB.totalExcluded} excluded, each with a documented reason — never silently dropped.</p>
          </Card>
          <Card>
            <CardLabel>Distribution</CardLabel>
            <p className="mt-2 text-3xl font-bold">{HB.medianMinutes}min</p>
            <p className="text-sm text-[var(--muted-strong)]">median — most proposals execute fast</p>
            <p className="mt-3 text-xs text-[var(--muted)]">P90 {HB.p90Hours}h · P95 {HB.p95Hours}h · max {HB.maxHours}h</p>
          </Card>
          <Card>
            <CardLabel>Longest observed</CardLabel>
            <p className="mt-2 text-3xl font-bold">{HB.longestCase.days.toFixed(2)}d</p>
            <p className="text-sm text-[var(--muted-strong)]">
              {HB.longestCase.dao} #{HB.longestCase.proposalId}
            </p>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Next longest: {HB.secondLongestCase.dao} #{HB.secondLongestCase.proposalId} at {HB.secondLongestCase.days.toFixed(2)}d.
            </p>
          </Card>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="py-2 pr-4 font-medium">&lt;5m</th>
                <th className="py-2 pr-4 font-medium">5m–1h</th>
                <th className="py-2 pr-4 font-medium">1h–6h</th>
                <th className="py-2 pr-4 font-medium">6h–24h</th>
                <th className="py-2 pr-4 font-medium">&gt;24h</th>
                <th className="py-2 pr-4 font-medium">&gt;48h</th>
                <th className="py-2 font-medium">&gt;7d</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-mono-num">
                <td className="py-2 pr-4">{HB.buckets["<5m"]}</td>
                <td className="py-2 pr-4">{HB.buckets["5m-1h"]}</td>
                <td className="py-2 pr-4">{HB.buckets["1h-6h"]}</td>
                <td className="py-2 pr-4">{HB.buckets["6h-24h"]}</td>
                <td className="py-2 pr-4">{HB.buckets[">24h"]}</td>
                <td className="py-2 pr-4">{HB.buckets[">48h"]}</td>
                <td className="py-2">{HB.buckets[">7d"]}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-sm text-[var(--muted-strong)]">
          Eligibility is defined as the Timelock <code>eta</code>, not proposal creation or queue time — the mandatory voting period and timelock delay are
          excluded from the measured interval by construction. Method, exclusions, and independent verification:{" "}
          <Link href="/docs/historical-baseline" className="text-[var(--accent)] underline">
            View methodology →
          </Link>
        </p>
        <p className="mt-2 font-mono-num text-xs text-[var(--muted)]">pnpm reproduce:historical · pnpm verify:historical · pnpm spot-check:historical</p>
      </Section>

      <Section id="claim-discipline" className="border-t border-[var(--border)]">
        <SectionHeading index="—" eyebrow="Claim discipline" title="What Marked does not claim." />
        <div className="mt-8 flex flex-wrap gap-2">
          {NOT_CLAIMED.map((c) => (
            <Badge key={c} tone="neutral">
              {c}
            </Badge>
          ))}
        </div>
      </Section>

      <Section id="agent-boundary" className="border-t border-[var(--border)]">
        <SectionHeading
          index="—"
          eyebrow="Agent boundary"
          title="A hallucinated plan cannot become a transaction."
          lead="These aren't descriptions of the validator's behavior — this section calls the real, deployed validateAgentPlan() against hand-crafted adversarial inputs, server-side, right now. Every one below is rejected before anything reaches a human, ARM, or KeeperHub."
        />
        <div className="mt-8">
          <AdversarialDemo />
        </div>
      </Section>

      <Section id="live-sandbox" className="border-t border-[var(--border)]">
        <SectionHeading index="—" eyebrow="Live" title="Persistence & authentication sandbox." lead="A real, live control surface over the Gate 7 engine — try arming or disarming without a token first to see the auth boundary fail closed." />
        <div className="mt-8 max-w-2xl">
          <RecoverySandbox />
        </div>
      </Section>
    </main>
  );
}
