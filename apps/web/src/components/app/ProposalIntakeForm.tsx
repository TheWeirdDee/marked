"use client";

import { useState, type FormEvent } from "react";

/**
 * Product repair — the "Resolve proposal appears to do nothing" P0 bug.
 *
 * Root cause (first pass): this page's actual resolution
 * (`resolveGovernanceIntake`) does multiple sequential live network calls —
 * Cactus GraphQL/SSR resolution, then Governor RPC reads — which can
 * genuinely take several seconds. The form was a plain `<form method="get">`
 * with zero loading state anywhere in the app, so a click gave no feedback
 * until the full response arrived.
 *
 * Root cause (CACTUS-LIVE-001 live-deployment follow-up, confirmed against a
 * real production request that came back as `GET /app/new?` — the `url`
 * value silently absent from the query string entirely): the original fix
 * set `disabled={resolving}` on the `url` input itself. Per the HTML living
 * standard's form submission algorithm, a form's outgoing entry list is
 * constructed from its controls' CURRENT state only *after* the `submit`
 * event's handlers finish running. Calling `setResolving(true)`
 * synchronously inside `onSubmit` lets React flush `disabled=true` to the
 * `url` input's DOM node before the browser builds that entry list — and a
 * disabled control is excluded from submission by every browser. The result
 * is a real navigation to `/app/new?` with no `url=` param at all: no error,
 * page "reloads", nothing to resolve. This is why the input below uses
 * `readOnly`, never `disabled` — a read-only control still submits its
 * value, unconditionally, regardless of this timing race. See
 * `ProposalIntakeForm.test.tsx` for the regression test and
 * `evidence/system-audit/findings.md` CACTUS-LIVE-002.
 *
 * The rest of the original fix still holds: this does NOT call
 * `preventDefault` — the browser still performs the real navigation, and the
 * sibling `loading.tsx` file provides the guaranteed, server-driven fallback
 * (React Suspense streaming shows it immediately, before
 * `resolveGovernanceIntake` resolves, for both a fresh hard navigation and
 * any client-side one).
 */
export function ProposalIntakeForm({ defaultUrl }: { defaultUrl: string }) {
  const [resolving, setResolving] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    const input = e.currentTarget.elements.namedItem("url") as HTMLInputElement | null;
    if (!input || !input.value.trim()) {
      e.preventDefault();
      return;
    }
    setResolving(true);
  }

  return (
    <form action="/app/new" method="get" onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="url"
        name="url"
        required
        defaultValue={defaultUrl}
        readOnly={resolving}
        aria-busy={resolving}
        placeholder="https://www.tally.xyz/gov/<org>/proposal/<id>"
        className="flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 read-only:opacity-60"
      />
      <button
        type="submit"
        disabled={resolving}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-medium text-black transition hover:bg-[var(--accent)] disabled:cursor-wait disabled:opacity-70"
      >
        {resolving ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden="true" />
            Resolving…
          </>
        ) : (
          "Resolve proposal →"
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {resolving ? "Resolving Cactus proposal and verifying the Governor onchain…" : ""}
      </span>
    </form>
  );
}
