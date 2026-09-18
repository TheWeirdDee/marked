import { notFound } from "next/navigation";
import Link from "next/link";
import type { FulfillmentStatus } from "@marked/core";
import { getAppStore, RECOVERY_SANDBOX_JOB_ID } from "@/lib/job-store";
import { Card, CardLabel } from "@/components/ui/Card";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import { HashChip } from "@/components/ui/HashChip";
import { formatRawTokenAmount } from "@/lib/format";
import { armJobAction, disarmJobAction, approveJobAction, prepareForApprovalAction, continueReconciliationAction } from "@/app/app/actions";
import { isLiveExecutionEnabled } from "@/lib/execution/keeperhub-config";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { askAboutFulfillment } from "@/lib/agent/actions";
import { isAgentAvailable } from "@/lib/agent/provider";

const DISARMABLE = new Set(["ARMED", "WAITING_ELIGIBILITY", "ELIGIBLE", "AWAITING_APPROVAL"]);
const RECONCILABLE = new Set<FulfillmentStatus>(["EXECUTING", "RECONCILING", "UNKNOWN_RECONCILING", "WAITING_FINALITY", "VERIFYING_GOVERNOR_STATE", "VERIFYING_POSTCONDITION"]);

/** Gate 11 §21 — never attempt a build-time static render for this DB-backed route; see apps/web/src/app/app/page.tsx's doc comment for why. */
export const dynamic = "force-dynamic";

export default async function FulfillmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getAppStore();
  const job = await store.get(id);
  if (!job) notFound();
  const events = await store.getEvents(id);
  const isSandbox = id === RECOVERY_SANDBOX_JOB_ID;

  const armAction = armJobAction.bind(null, id);
  const disarmAction = disarmJobAction.bind(null, id);
  const approveAction = approveJobAction.bind(null, id);
  const prepareAction = prepareForApprovalAction.bind(null, id);
  const reconcileAction = continueReconciliationAction.bind(null, id);
  const liveExecutionEnabled = isLiveExecutionEnabled();

  const rawAmount = job.commitment.postconditionBindings[0]?.bindingParams.find((p) => p.key === "rawAmount")?.value;
  const recipient = job.commitment.postconditionBindings[0]?.bindingParams.find((p) => p.key === "recipient")?.value;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-label">{isSandbox ? "Recovery sandbox" : "Fulfillment"}</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Proposal #{job.commitment.proposalId}</h1>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {isSandbox ? (
        <Card className="border-amber-800/40">
          <p className="text-sm text-[var(--muted-strong)]">
            This job reuses Gate 5&apos;s real frozen commitment fields to demonstrate the persistence + authentication
            engine live. It never calls KeeperHub.
          </p>
        </Card>
      ) : null}

      <NextActionBanner
        status={job.status}
        isSandbox={isSandbox}
        liveExecutionEnabled={liveExecutionEnabled}
        armAction={armAction}
        prepareAction={prepareAction}
        approveAction={approveAction}
        reconcileAction={reconcileAction}
        governor={job.commitment.governor}
        proposalId={job.commitment.proposalId}
        chainId={job.commitment.chainId}
        rawAmount={rawAmount}
        recipient={recipient}
      />

      <AgentPanel
        available={isAgentAvailable()}
        title="Marked Agent"
        suggestedQuestions={["What are we waiting for?", "Is authorization still unchanged?", "What happens after I approve?"]}
        askAction={askAboutFulfillment.bind(null, id)}
      />

      <Card>
        <CardLabel>Governance</CardLabel>
        <div className="space-y-2 text-sm">
          <Row label="Governor" value={<HashChip value={job.commitment.governor} />} />
          <Row label="Family" value={job.commitment.governorFamily} />
          <Row label="Chain" value={String(job.commitment.chainId)} />
          <Row label="Proposal" value={job.commitment.proposalId} />
        </div>
      </Card>

      <Card>
        <CardLabel>Frozen authorization</CardLabel>
        <p className="text-sm text-[var(--muted)]">
          Authorization locked. Marked refuses to arm if live authorization no longer matches this hash.
        </p>
        <div className="mt-3">
          <HashChip label="actionAuthorizationHash" value={job.commitment.frozenActionAuthorizationHash} />
        </div>
      </Card>

      {rawAmount && recipient ? (
        <Card className="border-emerald-900/40">
          <CardLabel>What Marked will verify</CardLabel>
          <p className="font-mono-num text-lg">
            Recipient balance must increase by exactly{" "}
            <span className="font-semibold text-[var(--accent)]">{formatRawTokenAmount(rawAmount)} MTGT</span>
          </p>
          <p className="mt-1 break-all text-xs text-[var(--muted)]">→ {recipient}</p>
        </Card>
      ) : null}

      <Card>
        <CardLabel>Frozen commitment</CardLabel>
        <div className="space-y-2 text-sm">
          <Row label="Mode" value={job.commitment.fulfillmentMode === "APPROVE" ? "Ask me first" : "Auto"} />
          <Row label="Execution surface" value={job.commitment.executionSurfaceId} />
          <Row label="fulfillmentCommitmentHash" value={<HashChip value={job.fulfillmentCommitmentHash} />} />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        {DISARMABLE.has(job.status) ? (
          <form action={disarmAction} className="flex items-center gap-2">
            <input
              name="reason"
              placeholder="Reason (optional)"
              className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg border border-[var(--border-strong)] px-5 py-2.5 text-sm font-medium transition hover:border-[var(--muted-strong)]">
              Disarm
            </button>
          </form>
        ) : null}
        {job.status === "FULFILLED_VERIFIED" ? (
          <Link href={`/proof/${id}`} className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-medium text-black transition hover:bg-[var(--accent)]">
            View receipt →
          </Link>
        ) : null}
      </div>

      <div>
        <CardLabel>Events</CardLabel>
        <ul className="mt-2 flex flex-col gap-2">
          {events.length === 0 ? <li className="text-sm text-[var(--muted)]">No events yet.</li> : null}
          {events.map((e, i) => (
            <li key={i} className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm">
              <span className="font-mono-num text-[var(--muted)]">{e.timestamp}</span> — <span className="font-medium">{e.type}</span> by{" "}
              <span className="font-mono-num">{e.actor}</span>
              {"reason" in e && e.reason ? <span className="text-[var(--muted)]"> ({e.reason})</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type BannerAction = (formData: FormData) => Promise<void>;

function NextActionBanner({
  status,
  isSandbox,
  liveExecutionEnabled,
  armAction,
  prepareAction,
  approveAction,
  reconcileAction,
  governor,
  proposalId,
  chainId,
  rawAmount,
  recipient,
}: {
  status: FulfillmentStatus;
  isSandbox: boolean;
  liveExecutionEnabled: boolean;
  armAction: BannerAction;
  prepareAction: BannerAction;
  approveAction: BannerAction;
  reconcileAction: BannerAction;
  governor: string;
  proposalId: string;
  chainId: number;
  rawAmount: string | undefined;
  recipient: string | undefined;
}) {
  if (status === "REVIEW_READY") {
    return (
      <Banner tone="accent">
        Ready to review. Arming locks this exact fulfillment — Marked cannot silently change it later.
        <form action={armAction} className="mt-3">
          <button type="submit" className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-black">
            Arm fulfillment
          </button>
        </form>
      </Banner>
    );
  }

  if (status === "ARMED") {
    if (isSandbox) {
      return (
        <Banner tone="warn">
          Armed. This sandbox job demonstrates commitment-freezing and the auth + persistence engine — it never calls
          KeeperHub, by design. The one fulfillment this submission proves end-to-end through real KeeperHub execution
          is the recorded{" "}
          <Link href="/demo" className="underline">
            Gate 5/6 proof
          </Link>
          .
        </Banner>
      );
    }
    return (
      <Banner tone="warn">
        Armed. Next: independently re-check eligibility, live authorization, and simulate the exact Governor call
        through KeeperHub — before anything can be approved.
        <form action={prepareAction} className="mt-3">
          <button type="submit" className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-black">
            Check eligibility &amp; simulate
          </button>
        </form>
      </Banner>
    );
  }

  if (status === "AWAITING_APPROVAL") {
    return (
      <Banner tone="accent">
        <p className="font-display text-sm font-bold uppercase tracking-wide">Ready to execute</p>
        <div className="mt-3 space-y-1.5 text-sm">
          <Row label="Governor" value={<span className="font-mono-num">{short(governor)}</span>} />
          <Row label="Proposal" value={proposalId} />
          <Row label="Network" value={chainId === 11155111 ? "Sepolia (testnet)" : chainId === 1 ? "Ethereum mainnet" : String(chainId)} />
          <Row label="Authorized action" value="Governor execute(proposalId) — never a target contract directly" />
          {rawAmount && recipient ? (
            <Row label="Expected economic outcome" value={`${formatRawTokenAmount(rawAmount)} MTGT → ${short(recipient)}`} />
          ) : null}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Authorized by Governor. Simulation already succeeded through KeeperHub. Approving submits the real
          execution — never something Marked&apos;s agent invented or requested on its own.
        </p>
        {liveExecutionEnabled ? (
          <form action={approveAction} className="mt-3">
            <button type="submit" className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-black">
              Execute via KeeperHub
            </button>
          </form>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-800/40 bg-[var(--warn-dim)] px-3 py-2 text-xs text-[var(--muted-strong)]">
            Live execution is disabled on this deployment pending demo-authentication hardening (a disclosed,
            deliberate limitation — see F-03) — not a bug. The wiring above is real and tested; only the final
            KeeperHub dispatch is withheld.
          </p>
        )}
      </Banner>
    );
  }

  if (status === "EXECUTING") {
    return <Banner tone="warn">Executing via KeeperHub…</Banner>;
  }

  if (RECONCILABLE.has(status)) {
    const label =
      status === "VERIFYING_GOVERNOR_STATE" || status === "VERIFYING_POSTCONDITION"
        ? "Verifying outcome…"
        : "Reconciling execution…";
    return (
      <Banner tone="warn">
        {label} {statusLabel(status)}. Execution submitted — this never means failed, and this control never
        blindly resends it.
        <form action={reconcileAction} className="mt-3">
          <button type="submit" className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium transition hover:border-[var(--muted-strong)]">
            Refresh status
          </button>
        </form>
      </Banner>
    );
  }

  if (status === "DISARMED_BY_USER") {
    return <Banner tone="neutral">Disarmed. This does not alter the underlying governance proposal.</Banner>;
  }

  if (status === "FULFILLED_VERIFIED") {
    return <Banner tone="accent">MARKED ✓ — executed via KeeperHub and independently verified.</Banner>;
  }

  if (status === "FULFILLED_UNVERIFIED") {
    return (
      <Banner tone="warn">
        Execution succeeded, but the required economic postcondition did not independently verify. Not MARKED ✓ — see
        the events below.
      </Banner>
    );
  }

  if (status === "FULFILLED_EXTERNALLY_VERIFIED" || status === "FULFILLED_EXTERNALLY_UNVERIFIED") {
    return (
      <Banner tone="accent">
        This proposal was already executed outside Marked — governance was still fulfilled; Marked simply
        wasn&apos;t the one that dispatched it. {status === "FULFILLED_EXTERNALLY_UNVERIFIED" ? "The economic outcome was not independently re-verified." : ""}
      </Banner>
    );
  }

  // Every refusal/blocked terminal state — a clear, named product result, never a silent dead end.
  return <Banner tone="warn">{statusLabel(status)}. See the events below for the exact reason.</Banner>;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Banner({ tone, children }: { tone: "accent" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls = tone === "accent" ? "border-emerald-900/60 bg-[var(--accent-dim)]" : tone === "warn" ? "border-amber-800/40 bg-[var(--warn-dim)]" : "border-[var(--border)]";
  return <div className={`rounded-xl border px-5 py-4 text-sm text-[var(--muted-strong)] ${cls}`}>{children}</div>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Fulfillment ${id}` };
}
