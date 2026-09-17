import type { AgentPlanValidationResult } from "@marked/core";
import { Badge } from "@/components/ui/Badge";

/**
 * Gate 10 §18-19 — the AGENT SUGGESTION → MARKED VALIDATION boundary, made
 * visible. Wording is deliberate: "PLAN VALIDATED" means the deterministic
 * validator accepted the plan's structure against canonical authorization —
 * it does NOT mean anything executed. There is no "Execute" control
 * anywhere in this component, on purpose.
 */
export function CandidatePlanView({ validation }: { validation: AgentPlanValidationResult }) {
  if (!validation.ok) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-[var(--danger-dim)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="danger">Rejected</Badge>
          <span className="font-mono-num text-xs text-[var(--muted)]">{validation.code}</span>
        </div>
        <p className="text-sm text-[var(--muted-strong)]">{validation.reason}</p>
        <p className="mt-3 font-mono-num text-xs text-[var(--muted)]">Blockchain writes: 0</p>
      </div>
    );
  }

  const { plan } = validation;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="section-label">Agent-prepared plan</span>
        </div>
        <p className="text-sm">{plan.explanation}</p>
        <div className="mt-3 grid gap-1.5 text-xs text-[var(--muted)]">
          <span>Suggested action(s): {plan.selectedActionIndexes.join(", ")}</span>
          <span>Execution: {plan.executionExplanation}</span>
          <span>Verification: {plan.verificationExplanation}</span>
        </div>
        {plan.riskNotes.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-[var(--warn)]">
            {plan.riskNotes.map((r, i) => (
              <li key={i}>⚠ {r}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex justify-center text-[var(--muted)]">↓</div>

      <div className="rounded-lg border border-emerald-900/60 bg-[var(--accent-dim)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="section-label text-[var(--accent)]">Marked validator</span>
        </div>
        <div className="space-y-1 text-sm">
          <Row label="Referenced actions" value="Exist on canonical authorization ✓" />
          <Row label="Coverage" value="FULL ✓" />
          <Row label="Fulfillability" value="Permits arming ✓" />
        </div>
        <p className="mt-3 font-display text-xl font-bold uppercase text-[var(--accent)]">Plan validated ✓</p>
        <p className="mt-1 text-xs text-[var(--muted)]">This means the plan&apos;s structure matches canonical authorization — not that anything has executed.</p>
      </div>

      <div className="rounded-lg border border-amber-800/40 bg-[var(--warn-dim)] px-4 py-3 text-center">
        <span className="font-mono-num text-xs font-semibold uppercase tracking-widest text-[var(--warn)]">Not authorized yet</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
