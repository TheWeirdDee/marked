"use client";

import { useState } from "react";
import type { AgentPlanValidationResult } from "@marked/core";
import { Badge } from "@/components/ui/Badge";
import { CandidatePlanView } from "./CandidatePlanView";

type Reply<T> = { ok: true; data: T } | { ok: false; reason: string };

export type AgentPanelProps = {
  available: boolean;
  unavailableReason?: string;
  title?: string;
  suggestedQuestions: string[];
  askAction: (question: string) => Promise<Reply<{ answer: string }>>;
  prepareAction?: () => Promise<Reply<{ validation: AgentPlanValidationResult; context: unknown }>>;
};

type ConversationEntry = { question: string; answer: string } | { question: string; error: string };

/**
 * Gate 10 §15 — the contextual "Marked Agent" panel. Every question or plan
 * request goes through a real Server Action to a real (env-gated) model
 * provider; there is no client-side fabrication of a response anywhere in
 * this component. `available === false` renders the honest "Agent
 * unavailable" state rather than a disabled-looking chat box that implies
 * something is almost working.
 */
export function AgentPanel({ available, unavailableReason, title = "Marked Agent", suggestedQuestions, askAction, prepareAction }: AgentPanelProps) {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [asking, setAsking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [planResult, setPlanResult] = useState<AgentPlanValidationResult | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  async function submitQuestion(q: string) {
    if (!q.trim() || asking) return;
    setAsking(true);
    try {
      const result = await askAction(q);
      setConversation((c) => [...c, result.ok ? { question: q, answer: result.data.answer } : { question: q, error: result.reason }]);
    } finally {
      setAsking(false);
      setQuestion("");
    }
  }

  async function handlePrepare() {
    if (!prepareAction || preparing) return;
    setPreparing(true);
    setPlanError(null);
    try {
      const result = await prepareAction();
      if (result.ok) setPlanResult(result.data.validation);
      else setPlanError(result.reason);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-display text-lg font-bold uppercase tracking-tight">{title}</span>
      </div>
      <div className="mb-4 flex gap-2">
        <Badge>Read + prepare</Badge>
        <Badge tone="warn">No execution authority</Badge>
      </div>

      {!available ? (
        <p className="text-sm text-[var(--muted)]">
          Agent unavailable — {unavailableReason ?? "the model provider is not configured on this server."} The
          deterministic product works regardless.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void submitQuestion(q)}
                disabled={asking}
                className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>

          {conversation.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4" role="log" aria-live="polite">
              {conversation.map((entry, i) => (
                <div key={i}>
                  <p className="text-sm font-medium">{entry.question}</p>
                  {"answer" in entry ? (
                    <p className="mt-1 text-sm text-[var(--muted-strong)]">{entry.answer}</p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--danger)]">{entry.error}</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitQuestion(question);
            }}
            className="mt-4 flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this proposal..."
              disabled={asking}
              className="flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium transition hover:border-[var(--accent)] disabled:opacity-40"
            >
              {asking ? "Asking…" : "Ask"}
            </button>
          </form>

          {prepareAction ? (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => void handlePrepare()}
                disabled={preparing}
                className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent)] disabled:opacity-40"
              >
                {preparing ? "Preparing…" : "Prepare candidate fulfillment plan"}
              </button>
              <div role="status" aria-live="polite">
                {planError ? <p className="mt-3 text-sm text-[var(--danger)]">{planError}</p> : null}
              </div>
              {planResult ? (
                <div className="mt-4">
                  <CandidatePlanView validation={planResult} />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
