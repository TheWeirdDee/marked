"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export type StepperStep = {
  label: string;
  detail: string;
};

/**
 * Gate 9R Part 44 — a guided, judge-paced replay of the recorded Gate 5/6
 * fulfillment. "Next" steps through real evidence-derived facts (passed in
 * as props, computed server-side — nothing here fabricates a value or
 * fakes a network call). Explicitly labeled as a replay throughout, never
 * implying a live execution is happening now.
 */
export function Stepper({ steps }: { steps: StepperStep[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const atStart = index === 0;
  const atEnd = index === steps.length - 1;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <Badge tone="warn">Recorded proof — not executing now</Badge>
        <span className="font-mono-num text-xs text-[var(--muted)]">
          {index + 1} / {steps.length}
        </span>
      </div>

      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-label={`Go to step ${i + 1}: ${s.label}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 flex-1 rounded-full transition ${i <= index ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
          />
        ))}
      </div>

      <div className="mt-6 min-h-[6rem]">
        <p className="section-label text-[var(--accent)]">
          {String(index + 1).padStart(2, "0")}
        </p>
        <p className="mt-1 text-xl font-semibold">{step.label}</p>
        <p className="mt-2 text-sm text-[var(--muted-strong)]">{step.detail}</p>
      </div>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          disabled={atStart}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm disabled:opacity-30"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
          className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-black disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </Card>
  );
}
