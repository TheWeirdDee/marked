"use client";

import { useState } from "react";

/** Displays a hash/address, shortened by default, with a copy-to-clipboard button. Never truncates the underlying value it copies — only the display. */
export function HashChip({ value, label, lead = 8, tail = 6 }: { value: string; label?: string; lead?: number; tail?: number }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > lead + tail + 3 ? `${value.slice(0, lead)}…${value.slice(-tail)}` : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — no-op, the value is still visible/selectable
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {label ? <span className="text-[var(--muted)]">{label}</span> : null}
      <button
        type="button"
        onClick={copy}
        title={value}
        className="font-mono-num inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--foreground)] transition hover:border-emerald-700"
      >
        {short}
        <span className="text-[var(--muted)]">{copied ? "✓ copied" : "copy"}</span>
      </button>
    </span>
  );
}
