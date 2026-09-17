"use client";

import { useState, type FormEvent } from "react";

/**
 * Product repair — the "Resolve proposal appears to do nothing" P0 bug.
 *
 * Root cause: this page's actual resolution (`resolveGovernanceIntake`)
 * does multiple sequential live network calls — Cactus GraphQL/SSR
 * resolution, then Governor RPC reads — which can genuinely take several
 * seconds. The form was a plain `<form method="get">` with zero loading
 * state anywhere in the app (no `loading.tsx` existed at all), so a click
 * gave no feedback until the full response arrived. It was never a
 * navigation/server-action failure — it was working the whole time,
 * silently.
 *
 * Fix: this thin client wrapper around the same native GET form (still
 * `method="get"`, still hits the same `searchParams`-driven server
 * component, still produces a shareable/bookmarkable URL) sets local
 * "resolving" state synchronously on submit, disabling the input/button
 * instantly and swapping in real status copy. It does NOT call
 * `preventDefault` — the browser still performs the real navigation, and
 * the sibling `loading.tsx` file provides the guaranteed, server-driven
 * fallback (React Suspense streaming shows it immediately, before
 * `resolveGovernanceIntake` resolves, for both a fresh hard navigation and
 * any client-side one). Together these give honest, never-silent
 * idle → resolving → (success | typed failure) feedback without faking any
 * stage this architecture doesn't actually have.
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
        disabled={resolving}
        placeholder="https://www.tally.xyz/gov/<org>/proposal/<id>"
        className="flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60"
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
