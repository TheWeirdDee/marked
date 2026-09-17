import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "warn" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-[var(--surface-raised)] text-[var(--muted)] border-[var(--border)]",
  accent: "bg-emerald-950/40 text-emerald-300 border-emerald-800/60",
  warn: "bg-amber-950/40 text-amber-300 border-amber-800/60",
  danger: "bg-red-950/40 text-red-300 border-red-800/60",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
