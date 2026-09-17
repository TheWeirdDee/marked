import Link from "next/link";
import { getAppStore, RECOVERY_SANDBOX_JOB_ID } from "@/lib/job-store";
import { Card, CardLabel } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Fulfillments" };

export default async function AppDashboard() {
  const store = getAppStore();
  const jobs = await store.listJobs();
  const realJobs = jobs.filter((j) => j.jobId !== RECOVERY_SANDBOX_JOB_ID);
  const sandboxJob = jobs.find((j) => j.jobId === RECOVERY_SANDBOX_JOB_ID);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight">Fulfillments</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Every governance proposal you have resolved through Marked.</p>
        </div>
        <LinkButton href="/app/new">New fulfillment →</LinkButton>
      </div>

      {realJobs.length === 0 ? (
        <EmptyState
          title="No fulfillment jobs yet"
          description="Start from a Cactus governance proposal. Marked independently resolves the underlying onchain Governor before anything can be armed."
          action={<LinkButton href="/app/new">New fulfillment →</LinkButton>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {realJobs.map((job) => (
            <Link
              key={job.jobId}
              href={`/app/fulfillments/${job.jobId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--border-strong)]"
            >
              <div>
                <p className="font-medium">
                  Proposal #{job.commitment.proposalId} — {job.commitment.governorFamily.replace(/_/g, " ").toLowerCase()}
                </p>
                <p className="font-mono-num text-xs text-[var(--muted)]">{job.commitment.governor}</p>
              </div>
              <StatusBadge status={job.status} />
            </Link>
          ))}
        </div>
      )}

      <div className="border-t border-[var(--border)] pt-8">
        <CardLabel>Recorded proof</CardLabel>
        <Card className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="accent">MARKED ✓</Badge>
                <span className="text-sm text-[var(--muted)]">Controlled Sepolia proposal #2</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                The real, independently-verified Gate 5/6 KeeperHub fulfillment — recorded, not live. This is the
                canonical proof this submission stands on.
              </p>
            </div>
            <div className="flex gap-3">
              <LinkButton href="/demo" variant="secondary">
                Guided replay
              </LinkButton>
              <LinkButton href="/proof/gate6">View receipt →</LinkButton>
            </div>
          </div>
        </Card>
      </div>

      {sandboxJob ? (
        <div>
          <CardLabel>Recovery sandbox</CardLabel>
          <Card className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <StatusBadge status={sandboxJob.status} />
                  <span className="text-sm text-[var(--muted)]">Separate demo job — never reaches KeeperHub</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Demonstrates the persistence + authentication engine live, reusing Gate 5&apos;s real frozen
                  commitment fields.
                </p>
              </div>
              <LinkButton href={`/app/fulfillments/${RECOVERY_SANDBOX_JOB_ID}`} variant="secondary">
                Open →
              </LinkButton>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
