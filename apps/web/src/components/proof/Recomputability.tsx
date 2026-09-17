import { Card } from "@/components/ui/Card";

export function Recomputability() {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-bold uppercase tracking-tight">Don&apos;t trust the badge. Verify the receipt.</h2>
      <Card>
        <p className="text-sm text-[var(--muted-strong)]">
          The receipt is derived from deterministic evidence — the frozen Governor authorization, a fresh
          re-resolution of that authorization, the Governor&apos;s final onchain state, and an independent
          block-pinned economic verification. Every field feeds a canonical, versioned, domain-separated hash
          (<span className="font-mono-num">computeReceiptHash</span> in{" "}
          <span className="font-mono-num">packages/core/src/receipt.ts</span>). Recompute it yourself:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-[var(--surface-raised)] p-4 text-xs text-[var(--muted-strong)]">
          <code>pnpm verify:gate6</code>
        </pre>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Reproduced three times as fully separate process invocations against this project&apos;s own evidence —
          identical hash every time. See <span className="font-mono-num">evidence/marked-receipt/</span>.
        </p>
      </Card>
    </section>
  );
}
