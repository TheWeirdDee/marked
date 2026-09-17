import type { ReactNode } from "react";

type CalloutType = "NOTE" | "PROVEN" | "SECURITY" | "LIMITATION";

const STYLES: Record<CalloutType, string> = {
  NOTE: "border-[var(--border-strong)] bg-[var(--surface-raised)]",
  PROVEN: "border-emerald-800/60 bg-[var(--accent-dim)]",
  SECURITY: "border-amber-800/50 bg-[var(--warn-dim)]",
  LIMITATION: "border-red-900/50 bg-[var(--danger-dim)]",
};

const LABEL_COLOR: Record<CalloutType, string> = {
  NOTE: "text-[var(--muted-strong)]",
  PROVEN: "text-[var(--accent)]",
  SECURITY: "text-[var(--warn)]",
  LIMITATION: "text-[var(--danger)]",
};

export function Callout({ type = "NOTE", children }: { type?: CalloutType; children: ReactNode }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${STYLES[type]}`}>
      <span className={`section-label mr-2 ${LABEL_COLOR[type]}`}>{type}</span>
      <span className="text-[var(--muted-strong)]">{children}</span>
    </div>
  );
}
