import { Card } from "@/components/ui/Card";

/**
 * Next.js App Router's automatic Suspense boundary for this route segment.
 * Because `NewFulfillmentPage` is an async Server Component that awaits
 * `resolveGovernanceIntake` directly in its body, this fallback is shown by
 * React's streaming SSR the instant navigation begins — including a plain
 * hard navigation from a native `<form method="get">` submit, not only a
 * client-side transition. This is the guaranteed half of the "Resolve
 * proposal" fix (see ProposalIntakeForm.tsx for the instant, best-effort
 * client-side half).
 */
export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-8" role="status" aria-live="polite">
      <div>
        <div className="h-8 w-72 animate-pulse rounded bg-[var(--surface-raised)]" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-[var(--surface-raised)]" />
      </div>
      <Card>
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" aria-hidden="true" />
          <p className="text-sm text-[var(--muted-strong)]">Resolving Cactus proposal and verifying the Governor onchain…</p>
        </div>
      </Card>
    </div>
  );
}
