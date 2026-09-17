import { resolveGovernanceIntake } from "@/lib/governance";
import { Card, CardLabel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { HashChip } from "@/components/ui/HashChip";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { shortenHex, formatRawTokenAmount } from "@/lib/format";
import { describeIntakeError } from "@/lib/intake-errors";
import { resolveAndOpenAction } from "@/app/app/actions";
import { ProposalIntakeForm } from "@/components/app/ProposalIntakeForm";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { askAboutProposal, prepareCandidatePlan } from "@/lib/agent/actions";
import { isAgentAvailable } from "@/lib/agent/provider";

export const metadata = { title: "New fulfillment" };

const EXAMPLE_URL = "https://www.tally.xyz/gov/compound/proposal/220";
/**
 * The real, currently-live Cactus governance surface — verified live during
 * Gate 1A (see evidence/cactus/discovery.md). Cactus rebranded from Tally
 * in mid-2026; the announced domain migration to cactushq.xyz has not
 * completed, so the actually-live product is still reached at tally.xyz.
 * This is not a stale/legacy link — it is the current, correct destination.
 */
const CACTUS_LIVE_URL = "https://www.tally.xyz";

const OUTCOME_COPY: Record<string, { title: string; tone: "accent" | "warn" | "danger" | "neutral" }> = {
  READY: { title: "Ready to arm", tone: "accent" },
  WAITING: { title: "Waiting", tone: "warn" },
  ALREADY_EXECUTED: { title: "Already executed", tone: "neutral" },
  CANCELED: { title: "Canceled", tone: "danger" },
  NOT_EXECUTABLE: { title: "Not executable", tone: "danger" },
  UNSUPPORTED_AUTHORIZATION: { title: "Unsupported authorization", tone: "danger" },
  UNSUPPORTED_VERIFICATION: { title: "Unsupported verification", tone: "warn" },
  CALLER_BLOCKED: { title: "Caller blocked", tone: "danger" },
};

export default async function NewFulfillmentPage({ searchParams }: { searchParams: Promise<{ url?: string; error?: string }> }) {
  const params = await searchParams;
  const url = params.url ?? "";

  let result: Awaited<ReturnType<typeof resolveGovernanceIntake>> | null = null;
  let error: string | null = null;

  if (url) {
    try {
      result = await resolveGovernanceIntake(url);
    } catch (err) {
      error = describeIntakeError(err);
    }
  }

  const isExampleUrl = url === EXAMPLE_URL;

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Fulfill a governance decision</h1>
        <p className="mt-2 text-[var(--muted)]">
          Start with a governance proposal from Cactus. Marked independently resolves the underlying onchain Governor
          before anything can be armed.
        </p>
      </div>

      <Card className="border-[var(--border-strong)] bg-[var(--surface-raised)]/40">
        <CardLabel>Start from a Cactus proposal</CardLabel>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Marked starts from a governance decision that already exists on Cactus. Marked does not create the vote —
          your DAO creates and passes a proposal through its existing Cactus/Governor process.
        </p>
        <ol className="flex flex-col gap-1.5 text-sm text-[var(--muted-strong)]">
          <li>1. Open your DAO&apos;s proposal on Cactus.</li>
          <li>2. Copy the proposal-page URL.</li>
          <li>3. Paste it into Marked.</li>
          <li>4. Marked resolves the underlying Governor and independently verifies exactly what governance authorized onchain.</li>
        </ol>
        <a
          href={CACTUS_LIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
        >
          Open Cactus ↗
        </a>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Cactus rebranded from Tally in 2026; live proposal pages are still reached at tally.xyz while that domain
          migration completes — that link above is the real, currently-live destination, not a stale one.
        </p>

        <div className="mt-5 grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Your DAO isn&apos;t on Cactus?</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Marked v1 currently supports Cactus-indexed governance. It can&apos;t register a DAO with Cactus
              itself —{" "}
              <a href="https://docs.tally.xyz" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                see Cactus&apos;s own setup documentation ↗
              </a>
              .
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Just exploring?</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Try the verified{" "}
              <a href={`/app/new?url=${encodeURIComponent(EXAMPLE_URL)}`} className="text-[var(--accent)] hover:underline">
                Compound #220 example ↗
              </a>{" "}
              — real, already-executed, read-only evidence, not a template for creating a new governance decision.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="section-label mb-3">Your proposal</p>
        <ProposalIntakeForm defaultUrl={isExampleUrl ? "" : url} />
      </Card>

      {error ? (
        <Card className="border-red-900/50" role="alert">
          <CardLabel>Resolution failed</CardLabel>
          <p className="text-sm text-[var(--muted-strong)]">{error}</p>
        </Card>
      ) : null}

      {result ? (
        <>
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <Badge>Cactus</Badge>
              <span className="text-sm text-[var(--muted)]">{result.cactus.organization.name}</span>
              {isExampleUrl ? <Badge tone="neutral">Historical example</Badge> : null}
            </div>
            <p className="font-medium">
              Proposal #{result.cactus.proposal.onchainProposalId} — {result.cactus.proposal.title}
            </p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Chain" value={result.coordinate.chainId === 1 ? "Ethereum mainnet" : `Chain ${result.coordinate.chainId}`} />
              <Row
                label="Governor"
                value={
                  <span className="inline-flex items-center gap-2">
                    <HashChip value={result.coordinate.governor} />
                    <ExplorerLink chainId={result.coordinate.chainId} type="address" value={result.coordinate.governor} className="text-xs">
                      View
                    </ExplorerLink>
                  </span>
                }
              />
              <Row label="Onchain state" value={result.eligibility?.stateLabel ?? "unknown"} />
              <Row label="Cactus-reported status" value={result.cactus.proposal.status ?? "unknown"} />
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Cactus tells Marked which governance decision we&apos;re serving. The Governor tells Marked exactly what
              was authorized.
            </p>
          </Card>

          {result.actions.length > 0 ? (
            <Card>
              <CardLabel>What was approved</CardLabel>
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {result.actions.map((a) => (
                  <div key={a.actionIndex} className="py-4">
                    <p className="text-xs text-[var(--muted)]">Action {a.actionIndex + 1}</p>
                    {a.decoded ? (
                      <p className="mt-1 font-medium">
                        Send {formatRawTokenAmount(a.decoded.amount)} raw units of {shortenHex(a.target)} to {shortenHex(a.decoded.recipient)}
                      </p>
                    ) : (
                      <p className="mt-1 text-[var(--muted)]">Meaning not modeled — unsupported signature (&quot;{a.signature}&quot;).</p>
                    )}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-[var(--muted)]">Raw authorization</summary>
                      <div className="mt-2 space-y-1 text-xs">
                        <Row label="Target" value={<HashChip value={a.target} />} />
                        <Row label="Function" value={a.signature} />
                        <Row label="Value" value={a.value} />
                        <Row label="Calldata" value={<HashChip value={a.calldata} lead={10} tail={8} />} />
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className={OUTCOME_COPY[result.fulfillability.outcome]?.tone === "accent" ? "border-emerald-900/60" : ""}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-[var(--muted)]">Can Marked fulfill this?</span>
              <Badge tone={OUTCOME_COPY[result.fulfillability.outcome]?.tone ?? "neutral"}>
                {OUTCOME_COPY[result.fulfillability.outcome]?.title ?? result.fulfillability.outcome}
              </Badge>
            </div>
            <p className="text-[var(--muted-strong)]">{result.fulfillability.summary}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-[var(--muted)]">Technical reason</summary>
              <p className="mt-1 text-xs text-[var(--muted)]">{result.fulfillability.technicalReason}</p>
            </details>

            {result.fulfillability.canArm ? (
              <form action={resolveAndOpenAction} className="mt-5">
                <input type="hidden" name="proposalUrl" value={url} />
                <button type="submit" className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-medium text-black transition hover:bg-[var(--accent)]">
                  Review fulfillment →
                </button>
              </form>
            ) : null}
          </Card>

          <AgentPanel
            available={isAgentAvailable()}
            suggestedQuestions={["What did this proposal approve?", "Why can't Marked fulfill it?", "What would Marked verify?"]}
            askAction={askAboutProposal.bind(null, url)}
            prepareAction={result.fulfillability.canArm ? prepareCandidatePlan.bind(null, url) : undefined}
          />
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
