import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";
import { HashChip } from "@/components/ui/HashChip";
import { LinkButton } from "@/components/ui/Button";
import { AccordionItem } from "@/components/ui/Accordion";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { loadLane2Gate5, loadGate6Receipt } from "@/lib/evidence";
import { formatRawTokenAmount, shortenHex } from "@/lib/format";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { HeroProofVisual } from "@/components/marketing/HeroProofVisual";
import { HISTORICAL_BASELINE_SUMMARY as HB } from "@/lib/historical-baseline-summary";

export default function LandingPage() {
  const { proof: proof5 } = loadLane2Gate5();
  const { proof: proof6 } = loadGate6Receipt();

  return (
    <main id="main-content" className="bg-grain bg-texture-strong">
      {/* --- Hero --- */}
      <section className="container-marked grid gap-12 pb-20 pt-20 sm:pt-28 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div className="flex flex-col items-start gap-8">
          <Badge tone="accent">Agent Economy Hackathon — KeeperHub</Badge>
          <Reveal>
            <h1 className="font-display text-[13vw] font-bold uppercase leading-[0.92] tracking-tight sm:text-7xl md:text-6xl lg:text-7xl">
              Your DAO passed it.
              <br />
              Why are you still <span className="text-[var(--accent)]">babysitting</span> it?
            </h1>
          </Reveal>
          <Reveal delay={0.1} className="max-w-xl text-lg text-[var(--muted-strong)] sm:text-xl">
            Marked closes the last mile between a governance decision and the economic action it authorized.
          </Reveal>
          <Reveal delay={0.2} className="flex flex-wrap items-center gap-4">
            <LinkButton href="/app">Open Marked →</LinkButton>
            <LinkButton href="/demo" variant="secondary">
              Watch a real fulfillment
            </LinkButton>
          </Reveal>
          <Reveal delay={0.3} className="flex flex-wrap gap-x-6 gap-y-2 pt-4">
            {["Real Sepolia proof", "KeeperHub execution", "Independent verification"].map((t) => (
              <span key={t} className="section-label">
                {t}
              </span>
            ))}
          </Reveal>
        </div>

        {proof5 && proof6 ? (
          <Reveal delay={0.15} className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <div
              className="pointer-events-none absolute -inset-x-10 -inset-y-16 -z-10 opacity-70"
              style={{ background: "radial-gradient(ellipse 70% 60% at 50% 30%, rgba(52, 211, 153, 0.1), transparent 70%)" }}
              aria-hidden="true"
            />
            <HeroProofVisual proof5={proof5} proof6={proof6} />
          </Reveal>
        ) : null}
      </section>

      <div className="container-marked">
        <div className="rule" />
      </div>

      {/* --- Passed ≠ Executed --- */}
      <Section>
        <SectionHeading index="01" eyebrow="The problem" title="Passed ≠ Executed." />
        <div className="mt-12 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {[
            { n: "01", t: "Proposal passes" },
            { n: "02", t: "Timelock matures" },
          ].map((step) => (
            <FlowStep key={step.n} n={step.n} t={step.t} />
          ))}

          <Arrow />

          <Reveal className="flex flex-1 flex-col justify-center rounded-xl border border-[var(--danger)]/50 bg-[var(--danger-dim)] p-6 lg:py-8">
            <span className="section-label text-[var(--danger)]">The operational gap</span>
            <p className="mt-2 font-display text-2xl font-semibold uppercase leading-tight text-[var(--danger)]">
              Someone still has to come back and finish it.
            </p>
          </Reveal>

          <Arrow />

          {[
            { n: "04", t: "Execution" },
            { n: "05", t: "Did the intended result actually happen?" },
          ].map((step) => (
            <FlowStep key={step.n} n={step.n} t={step.t} />
          ))}
        </div>
        <Reveal delay={0.1} className="mt-10 max-w-2xl text-lg text-[var(--muted-strong)]">
          A DAO can finish voting while the authorized economic action remains unfinished. Marked turns that
          operational gap into a deterministic fulfillment job.
        </Reveal>
        <Reveal delay={0.15} className="mt-8 max-w-3xl rounded-xl border border-[var(--border)] p-5">
          <p className="text-sm text-[var(--muted-strong)]">
            This isn&apos;t hypothetical: across {HB.totalIncluded} executed Compound + Uniswap Governor Bravo
            proposals on Ethereum mainnet, {HB.buckets[">24h"]} took more than 24 hours to execute after becoming
            eligible, and the longest took {HB.maxHours}h ({HB.longestCase.dao} #{HB.longestCase.proposalId}).{" "}
            <Link href="/evidence" className="text-[var(--accent)] underline">
              View methodology →
            </Link>
          </p>
          <div className="mt-4 flex h-10 items-end gap-1" role="img" aria-label={`Distribution of ${HB.totalIncluded} measured fulfillment intervals, from under 5 minutes to over 7 days`}>
            {(
              [
                ["<5m", HB.buckets["<5m"]],
                ["5m-1h", HB.buckets["5m-1h"]],
                ["1h-6h", HB.buckets["1h-6h"]],
                ["6h-24h", HB.buckets["6h-24h"]],
                [">24h", HB.buckets[">24h"]],
                [">48h", HB.buckets[">48h"]],
                [">7d", HB.buckets[">7d"]],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1" title={`${label}: ${count}`}>
                <div
                  className="w-full rounded-sm bg-[var(--accent)]/70"
                  style={{ height: `${Math.max(6, (count / HB.buckets["<5m"]) * 100)}%` }}
                  aria-hidden="true"
                />
                <span className="font-mono-num text-[9px] text-[var(--muted)]">{count}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* --- How Marked works --- */}
      <Section id="how-it-works" className="border-t border-[var(--border)]">
        <SectionHeading index="02" eyebrow="Mechanism" title="From decision to verified outcome." />
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {[
            { n: "01", t: "Resolve", d: "Start from a Cactus governance proposal. Marked resolves the underlying Governor independently." },
            { n: "02", t: "Lock", d: "Freeze exactly what governance authorized. No agent may silently reinterpret recipient, amount, target, or calldata." },
            { n: "03", t: "Fulfill", d: "When the action becomes legally executable, KeeperHub submits the bounded Governor lifecycle call." },
            { n: "04", t: "Verify", d: "Marked independently observes the resulting protocol/economic state. Only exact reconciliation earns MARKED ✓." },
          ].map((b) => (
            <Reveal key={b.n} className="border-t border-[var(--border-strong)] pt-5">
              <span className="section-label text-[var(--accent)]">{b.n}</span>
              <p className="mt-2 font-display text-3xl font-bold uppercase">{b.t}</p>
              <p className="mt-3 text-[var(--muted-strong)]">{b.d}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* --- Three truths --- */}
      <Section id="three-truths" className="border-t border-[var(--border)]">
        <SectionHeading index="03" eyebrow="The core idea" title="A tx hash is not the same as fulfillment." lead="Marked reconciles three independent truths." />
        {proof5 && proof6 ? (
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <Reveal>
              <TruthCard
                label="Authorized"
                sub="What governance actually approved"
                source="Onchain Governor authorization"
                body={
                  <>
                    <p className="text-sm text-[var(--muted)]">Send</p>
                    <p className="font-mono-num text-2xl font-semibold">
                      {formatRawTokenAmount(proof6.decodedAction.rawAmount)} MTGT
                    </p>
                    <p className="font-mono-num text-sm text-[var(--muted)]">→ {shortenHex(proof6.decodedAction.recipient)}</p>
                  </>
                }
              />
            </Reveal>
            <Reveal delay={0.1}>
              <TruthCard
                label="Executed"
                sub="What actually went onchain"
                source="KeeperHub execution"
                body={
                  <>
                    <p className="font-mono-num text-sm">Governor.execute({proof5.commitment.proposalId})</p>
                    <div className="mt-2">
                      <HashChip value={proof5.execution.transactionHash} />
                    </div>
                  </>
                }
              />
            </Reveal>
            <Reveal delay={0.2}>
              <TruthCard
                label="Observed"
                sub="What actually changed"
                source="Independent postcondition verification"
                body={
                  <>
                    <p className="text-sm text-[var(--muted)]">
                      Before <span className="font-mono-num text-[var(--foreground)]">{formatRawTokenAmount(proof6.postcondition.preState.recipientBalanceBefore)} MTGT</span>
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      After <span className="font-mono-num text-[var(--foreground)]">{formatRawTokenAmount(proof6.postcondition.observed.recipientBalanceAfter)} MTGT</span>
                    </p>
                    <p className="mt-1 font-mono-num text-sm font-semibold text-[var(--accent)]">
                      Delta +{formatRawTokenAmount(proof6.postcondition.observed.observedDelta)} MTGT
                    </p>
                  </>
                }
              />
            </Reveal>
          </div>
        ) : null}
        <Reveal delay={0.3} className="mt-10 flex flex-col items-center gap-2 rounded-xl border border-emerald-900/50 bg-[var(--accent-dim)] py-8 text-center">
          <span className="font-mono-num text-sm text-[var(--muted-strong)]">Expected = Observed</span>
          <span className="font-display text-4xl font-bold uppercase text-[var(--accent)]">Marked ✓</span>
        </Reveal>
      </Section>

      {/* --- Product preview --- */}
      <Section className="border-t border-[var(--border)]">
        <SectionHeading index="04" eyebrow="The product" title="See it before you touch it." />
        {proof5 ? (
          <Reveal className="mt-12">
            <Card className="mx-auto max-w-lg">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium">Fulfillment #{proof5.commitment.proposalId}</span>
                <Badge tone="accent">Ready to verify</Badge>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[var(--muted)]">Authorized</p>
                  <p className="font-mono-num">1,000 MTGT → recipient</p>
                </div>
                <div>
                  <p className="text-[var(--muted)]">Execution</p>
                  <p className="font-mono-num">Governor.execute({proof5.commitment.proposalId})</p>
                </div>
                <div>
                  <p className="text-[var(--muted)]">Verification</p>
                  <p className="font-mono-num">recipient delta = 1,000 MTGT</p>
                </div>
              </div>
              <LinkButton href="/app" className="mt-5 w-full">
                Review fulfillment
              </LinkButton>
            </Card>
          </Reveal>
        ) : null}
      </Section>

      {/* --- Real proof --- */}
      <Section id="real-proof" className="border-t border-[var(--border)] bg-[var(--surface)]/40">
        <div className="mb-4">
          <Badge tone="accent">Real controlled Sepolia fulfillment</Badge>
        </div>
        <Reveal>
          <h2 className="font-display text-5xl font-bold uppercase leading-[0.94] tracking-tight sm:text-6xl md:text-7xl">
            1,000 MTGT.
            <br className="hidden sm:block" /> Authorized. Executed. Observed.
          </h2>
        </Reveal>
        {proof5 && proof6 ? (
          <Reveal delay={0.1} className="mt-10">
            <Card className="border-emerald-900/40">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <ProofRow label="Governor proposal" value={`#${proof5.commitment.proposalId}`} />
                <ProofRow label="Execution" value="KeeperHub" />
                <ProofRow label="Call" value={`Governor.execute(${proof5.commitment.proposalId})`} />
                <ProofRow label="Status" value="MARKED ✓" />
                <ProofRow label="Before" value={`${formatRawTokenAmount(proof6.postcondition.preState.recipientBalanceBefore)} MTGT`} />
                <ProofRow label="After" value={`${formatRawTokenAmount(proof6.postcondition.observed.recipientBalanceAfter)} MTGT`} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
                <span className="inline-flex items-center gap-2">
                  <HashChip label="Execution tx" value={proof5.execution.transactionHash} />
                  <ExplorerLink chainId={proof5.commitment.chainId} type="tx" value={proof5.execution.transactionHash} className="text-xs">
                    View on Sepolia Etherscan
                  </ExplorerLink>
                </span>
                <HashChip label="Marked receipt hash" value={proof6.receiptHash} />
              </div>
            </Card>
          </Reveal>
        ) : null}
        <Reveal delay={0.15} className="mt-6 flex flex-wrap gap-4">
          <LinkButton href="/proof/gate6">Inspect the complete proof →</LinkButton>
          <LinkButton href="/evidence" variant="secondary">
            View technical evidence →
          </LinkButton>
        </Reveal>
        <p className="mt-4 text-sm text-[var(--muted)]">Controlled Sepolia proof — not Cactus-indexed and not a real DAO.</p>
      </Section>

      {/* --- Fail closed --- */}
      <Section className="border-t border-[var(--border)]">
        <SectionHeading index="05" eyebrow="Safety" title="When Marked isn't certain, it doesn't execute." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Too early", d: "Timelock hasn't matured.", a: "Wait" },
            { t: "Authorization changed", d: "Current Governor state no longer matches the frozen commitment.", a: "Refuse" },
            { t: "Simulation reverts", d: "The exact lifecycle call fails simulation.", a: "Refuse" },
            { t: "Effect cannot be verified", d: "Marked cannot independently prove the economic result.", a: "Do not mark" },
          ].map((c) => (
            <Reveal key={c.t} className="rounded-xl border border-amber-900/40 bg-[var(--warn-dim)] p-5">
              <p className="font-medium">{c.t}</p>
              <p className="mt-2 text-sm text-[var(--muted-strong)]">{c.d}</p>
              <p className="font-mono-num mt-4 text-xs uppercase tracking-widest text-[var(--warn)]">{c.a}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* --- Architecture --- */}
      <Section className="border-t border-[var(--border)]">
        <SectionHeading index="06" eyebrow="Integration architecture" title="Governance decides. KeeperHub executes. Marked verifies." />
        <div className="mt-14 flex flex-col">
          {[
            { t: "Cactus", d: "Governance context" },
            { t: "Governor", d: "Cryptographic authorization" },
            { t: "Marked", d: "Commitment, eligibility, policy, postcondition" },
            { t: "KeeperHub", d: "Bounded execution" },
            { t: "Target protocol", d: "Economic state" },
            { t: "Marked Receipt", d: "Verified fulfillment" },
          ].map((row, i, arr) => (
            <Reveal key={row.t} delay={i * 0.04} className="grid grid-cols-[3rem_1px_1fr] gap-x-5 sm:grid-cols-[4rem_1px_1fr]">
              <span className="font-mono-num pt-1 text-right text-2xl text-[var(--muted)] sm:text-3xl">{String(i + 1).padStart(2, "0")}</span>
              <span className="relative flex justify-center">
                <span className="h-full w-px bg-[var(--border-strong)]" aria-hidden="true" />
                <span className="absolute top-1.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[var(--accent)]" style={{ left: "50%" }} aria-hidden="true" />
              </span>
              <div className={i < arr.length - 1 ? "pb-8" : ""}>
                <p className="font-display text-2xl font-bold uppercase leading-none sm:text-3xl">{row.t}</p>
                <p className="mt-1.5 text-sm text-[var(--muted-strong)]">{row.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 max-w-2xl border-l-2 border-[var(--accent)] pl-4 text-sm text-[var(--muted-strong)]">
          Cactus does not define authoritative calldata. The Governor does. KeeperHub does not decide what
          money-moving action should happen. Marked does not create governance authority.
        </p>
      </Section>

      {/* --- Agent boundary --- */}
      <Section className="border-t border-[var(--border)]">
        <SectionHeading index="07" eyebrow="Agent economy" title="The agent prepares. The commitment decides." lead="An agent can understand the governance object, explain it, and compose the fulfillment workflow. But at runtime the money-moving action is constrained by deterministic authorization." />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <Reveal className="rounded-xl border border-emerald-900/40 bg-[var(--accent-dim)] p-6">
            <p className="section-label text-[var(--accent)]">Agent can</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted-strong)]">
              {["Explain proposal", "Resolve intent", "Compose bounded plan", "Explain waiting state", "Explain refusal", "Summarize receipt"].map((x) => (
                <li key={x}>— {x}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="rounded-xl border border-red-900/40 bg-[var(--danger-dim)] p-6">
            <p className="section-label text-[var(--danger)]">Agent cannot</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted-strong)]">
              {["Change recipient", "Change amount", "Change target", "Bypass timelock", "Override simulation", "Bypass caller authority", "Invent runtime calldata"].map((x) => (
                <li key={x}>— {x}</li>
              ))}
            </ul>
          </Reveal>
        </div>
        <p className="mt-6 text-sm text-[var(--muted)]">KeeperHub executes the exact bounded action.</p>

        <div className="mt-14 flex flex-col gap-6 border-t border-[var(--border)] pt-10 sm:flex-row sm:items-start sm:gap-3">
          {[
            { t: "Understand", actor: "Agent", d: "Agent interprets governance context." },
            { t: "Compose", actor: "Agent", d: "Agent prepares a candidate fulfillment." },
            { t: "Validate", actor: "Marked", d: "Marked reconstructs authority independently." },
            { t: "Execute", actor: "KeeperHub", d: "KeeperHub receives only the validated bounded call." },
          ].map((step, i, arr) => (
            <div key={step.t} className="flex flex-1 items-start gap-3 sm:contents">
              <div className="flex-1">
                <p className="font-mono-num text-[10px] uppercase tracking-widest text-[var(--muted)]">{step.actor}</p>
                <p className="section-label mt-1 text-base normal-case tracking-normal text-[var(--accent)]">{step.t}</p>
                <p className="mt-1.5 text-sm text-[var(--muted-strong)]">{step.d}</p>
              </div>
              {i < arr.length - 1 ? (
                <span className="hidden shrink-0 pt-6 text-[var(--muted)] sm:block" aria-hidden="true">
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm font-medium uppercase tracking-wide text-[var(--muted-strong)]">
          The agent prepares. The commitment decides.
        </p>
        <div className="mt-6">
          <LinkButton href="/docs/agent" variant="secondary">
            See the agent boundary →
          </LinkButton>
        </div>
      </Section>

      {/* --- Who it's for --- */}
      <Section className="border-t border-[var(--border)]">
        <SectionHeading index="08" eyebrow="Who it's for" title="For the people who have to make sure the vote actually happens." />
        <Reveal delay={0.1} className="mt-8 grid gap-8 sm:grid-cols-2">
          <div>
            <ul className="space-y-2 text-[var(--muted-strong)]">
              {["DAO operations", "Foundation operations", "Treasury teams", "Protocol operators", "Governance stewards"].map((x) => (
                <li key={x}>— {x}</li>
              ))}
            </ul>
          </div>
          <blockquote className="border-l-2 border-[var(--accent)] pl-5 text-lg italic text-[var(--muted-strong)]">
            &ldquo;We already got the vote. Why does someone still have to remember to come back and finish it?&rdquo;
          </blockquote>
        </Reveal>
      </Section>

      {/* --- FAQ --- */}
      <Section id="faq" className="border-t border-[var(--border)]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading index="09" eyebrow="FAQ" title="Questions, answered plainly." />
            <p className="mt-6 max-w-sm text-sm text-[var(--muted-strong)]">
              Still have one? The{" "}
              <Link href="/docs" className="text-[var(--accent)] underline">
                docs
              </Link>{" "}
              and{" "}
              <Link href="/evidence" className="text-[var(--accent)] underline">
                evidence
              </Link>{" "}
              pages go deeper than plain-language answers can.
            </p>
          </div>
          <div className="min-w-0">
          <AccordionItem question="What is Marked?">
            Marked is a governance fulfillment layer that binds an approved governance action to deterministic
            execution and independent outcome verification.
          </AccordionItem>
          <AccordionItem question="Isn't this just Cactus's Execute button?">
            No. Cactus provides the governance operating surface and already supports execution. Marked focuses on
            the operational last mile: freezing the authorization, waiting for eligibility, bounded KeeperHub
            execution, and independently verifying the intended outcome.
          </AccordionItem>
          <AccordionItem question="Does Marked decide what a DAO should do?">
            No. Governance creates authority. Marked may fulfill existing governance authority; it cannot create it.
          </AccordionItem>
          <AccordionItem question="What does KeeperHub do?">
            KeeperHub provides the managed execution surface used for the bounded onchain lifecycle call, including
            simulation and execution infrastructure.
          </AccordionItem>
          <AccordionItem question="Why isn't a successful transaction enough?">
            Because transaction success proves execution did not revert. It does not necessarily prove the intended
            economic/protocol outcome occurred. Marked verifies supported postconditions independently.
          </AccordionItem>
          <AccordionItem question="Can an AI agent change the transaction?">
            No. The agent may prepare and explain. The frozen commitment constrains runtime execution.
          </AccordionItem>
          <AccordionItem question="What happens if the proposal changes?">
            Marked refuses execution when the current Governor authorization no longer matches the frozen
            authorization.
          </AccordionItem>
          <AccordionItem question="What happens if the timelock hasn't matured?">
            Marked waits. It does not submit early.
          </AccordionItem>
          <AccordionItem question="Does Marked work with every Governor and protocol?">
            No. Current support is deliberately bounded (Governor Bravo, ERC20 transfers). Unsupported authorization
            families or economic effects fail closed rather than being silently approximated.
          </AccordionItem>
          <AccordionItem question="Is this running on mainnet?">
            The current execution proof is controlled Sepolia. Live Cactus governance resolution has separately been
            proven against real mainnet governance objects. These are two separate proofs, never presented as one.
          </AccordionItem>
          <AccordionItem question="What does MARKED ✓ mean?">
            It means the frozen governance authorization, actual execution, final Governor state, and independently
            observed supported postcondition all reconciled.
          </AccordionItem>
          <AccordionItem question="Can I verify a receipt myself?">
            Yes — see <Link href="/docs/receipt-verification" className="text-[var(--accent)] underline">the verification docs</Link> and{" "}
            <Link href="/evidence" className="text-[var(--accent)] underline">the evidence page</Link>.
          </AccordionItem>
          </div>
        </div>
      </Section>
    </main>
  );
}

function FlowStep({ n, t }: { n: string; t: string }) {
  return (
    <Reveal className="flex-1 rounded-xl border border-[var(--border)] p-5">
      <span className="section-label">{n}</span>
      <p className="mt-3 font-display text-xl font-semibold uppercase leading-tight">{t}</p>
    </Reveal>
  );
}

function Arrow() {
  return (
    <span className="flex items-center justify-center text-2xl text-[var(--muted)] lg:rotate-0" aria-hidden="true">
      <span className="lg:hidden">↓</span>
      <span className="hidden lg:inline">→</span>
    </span>
  );
}

function TruthCard({ label, sub, source, body }: { label: string; sub: string; source: string; body: React.ReactNode }) {
  return (
    <Card className="h-full">
      <CardLabel>{label}</CardLabel>
      <p className="mb-4 text-sm text-[var(--muted)]">{sub}</p>
      {body}
      <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">Source: {source}</p>
    </Card>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)]/50 py-1.5">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-mono-num">{value}</span>
    </div>
  );
}
