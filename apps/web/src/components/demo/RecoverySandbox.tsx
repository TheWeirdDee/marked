"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";

type JobState = {
  job: { jobId: string; status: string; fulfillmentCommitmentHash: string; updatedAt: string };
  events: { type: string; actor: string; timestamp: string; reason?: string | null }[];
};

/**
 * A real, live control surface over the Gate 7 persistence + auth boundary —
 * NOT the canonical Gate 5/6 proof (that is read-only evidence, displayed
 * elsewhere on this page and never mutated by anything here). Arming and
 * disarming this sandbox job actually authenticates, actually persists to
 * SQLite, and actually records the actor on the event — nothing here is
 * simulated in the browser. It never calls KeeperHub.
 */
export function RecoverySandbox() {
  const [actorId, setActorId] = useState("judge");
  const [token, setToken] = useState("");
  const [state, setState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/fulfillment/state");
    setState((await res.json()) as JobState);
  }

  useEffect(() => {
    refresh().catch(() => setError("Failed to load sandbox state."));
  }, []);

  async function call(path: "arm" | "disarm") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fulfillment/${path}`, {
        method: "POST",
        headers: { "x-demo-token": token, "x-actor-id": actorId, "content-type": "application/json" },
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? `Request failed (${res.status})`);
      } else {
        await refresh();
      }
    } catch {
      setError("Network error calling the sandbox API.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardLabel>Recovery sandbox</CardLabel>
        <Badge tone="warn">Demo security sandbox</Badge>
        <Badge tone="danger">Not a governance execution</Badge>
        <Badge tone="neutral">Never reaches KeeperHub</Badge>
      </div>
      <p className="text-sm text-[var(--muted)]">
        This is a real authenticated call against a real SQLite-persisted job — arming reuses the same frozen
        Sepolia commitment fields proven in Gate 5, in a separate sandbox job that never reaches KeeperHub. Try it
        with and without a valid token to see the auth boundary fail closed.
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        The real session token is never sent to this page or embedded in any script it loads — it exists only on the
        server. Unless you separately know that server-side value (an operator running this locally, for example),
        every call below will correctly fail with 401. That failure is the boundary working as intended, not a bug
        in this demo.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Actor ID</span>
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Demo session token</span>
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
            placeholder="leave blank to see a 401"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => call("arm")}
          className="rounded-lg bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-black transition hover:bg-[var(--accent)] disabled:opacity-50"
        >
          Arm
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => call("disarm")}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--muted)] disabled:opacity-50"
        >
          Disarm
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-lg px-4 py-2 text-sm text-[var(--muted)]">
          Refresh
        </button>
      </div>

      <div role="status" aria-live="polite">
        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      {state ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">Current status</span>
            <Badge tone="accent">{state.job.status}</Badge>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-[var(--muted)]">
            {state.events.length === 0 ? <li>No events yet.</li> : null}
            {state.events.map((e, i) => (
              <li key={i} className="font-mono-num">
                {e.timestamp} — {e.type} by {e.actor}
                {e.reason ? ` (${e.reason})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
