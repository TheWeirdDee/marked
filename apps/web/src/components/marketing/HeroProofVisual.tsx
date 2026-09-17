"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { HashChip } from "@/components/ui/HashChip";
import { formatRawTokenAmount, shortenHex } from "@/lib/format";
import type { Gate5Proof, Gate6Proof } from "@/lib/evidence";

/**
 * The hero's right-half proof visualization (§4). Not decorative art — every
 * value rendered here is read from the real, committed Gate 5/6 evidence
 * (the same `proof5`/`proof6` the "Real proof" section further down the
 * page already uses), reduced to the reconciliation shape: AUTHORIZED →
 * EXECUTED → OBSERVED → EXPECTED = OBSERVED → MARKED ✓.
 *
 * Follows Reveal.tsx's own pattern exactly: the server-rendered markup is
 * never hidden — cards are plain and fully visible in the initial HTML —
 * so if JS never runs, or `prefers-reduced-motion` is set, the final state
 * is what's shown immediately, with nothing to get stuck hidden behind.
 * When motion is allowed, a single restrained GSAP timeline staggers the
 * four stages in once (no loop) and settles on MARKED ✓.
 */
export function HeroProofVisual({ proof5, proof6 }: { proof5: Gate5Proof; proof6: Gate6Proof }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-proof-card]"));
    const rails = Array.from(root.querySelectorAll<HTMLElement>("[data-proof-rail]"));
    const badge = root.querySelector<HTMLElement>("[data-proof-badge]");

    const ctx = gsap.context(() => {
      gsap.set(cards, { opacity: 0, y: 18 });
      gsap.set(rails, { scaleY: 0, transformOrigin: "top" });
      if (badge) gsap.set(badge, { opacity: 0, scale: 0.92 });

      const tl = gsap.timeline({ delay: 0.35 });
      cards.forEach((card, i) => {
        tl.to(card, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, i === 0 ? 0 : "-=0.1");
        const rail = rails[i];
        if (rail) tl.to(rail, { scaleY: 1, duration: 0.3, ease: "power1.inOut" }, "-=0.15");
      });
      if (badge) tl.to(badge, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, "-=0.05");
    }, root);

    return () => ctx.revert();
  }, []);

  const rawAmount = formatRawTokenAmount(proof6.decodedAction.rawAmount);

  return (
    <div ref={rootRef} className="relative flex w-full flex-col items-stretch">
      <div className="mb-4 flex justify-center">
        <span className="section-label rounded-full border border-[var(--border-strong)] px-3 py-1">Recorded real Sepolia proof</span>
      </div>

      <div data-proof-card className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="section-label mb-1 text-[var(--accent)]">Authorized</p>
        <p className="font-mono-num text-xl font-semibold">{rawAmount} MTGT</p>
        <p className="font-mono-num text-xs text-[var(--muted)]">→ {shortenHex(proof6.decodedAction.recipient)}</p>
      </div>
      <div data-proof-rail className="mx-auto h-6 w-px bg-[var(--border-strong)]" aria-hidden="true" />

      <div data-proof-card className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="section-label mb-1 text-[var(--accent)]">Executed</p>
        <p className="font-mono-num text-sm">Governor.execute({proof6.identity.proposalId})</p>
        <div className="mt-1.5">
          <HashChip value={proof6.identity.executionTxHash} />
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted)]">Block {proof5.finality.inclusionBlock} · KeeperHub</p>
      </div>
      <div data-proof-rail className="mx-auto h-6 w-px bg-[var(--border-strong)]" aria-hidden="true" />

      <div data-proof-card className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="section-label mb-1 text-[var(--accent)]">Observed</p>
        <p className="font-mono-num text-sm">
          0 → <span className="font-semibold text-[var(--foreground)]">{rawAmount} MTGT</span>
        </p>
        <p className="mt-1.5 text-xs text-[var(--muted)]">Independent postcondition verification, block-pinned</p>
      </div>
      <div data-proof-rail className="mx-auto h-6 w-px bg-[var(--border-strong)]" aria-hidden="true" />

      <div data-proof-badge className="flex flex-col items-center gap-1 rounded-xl border border-emerald-800/60 bg-[var(--accent-dim)] py-5">
        <span className="font-mono-num text-xs text-[var(--muted-strong)]">Expected = Observed</span>
        <span className="font-display text-3xl font-bold uppercase text-[var(--accent)]">Marked ✓</span>
      </div>
    </div>
  );
}
