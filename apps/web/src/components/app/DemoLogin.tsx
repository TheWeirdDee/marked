import { MarkedWordmark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";
import { enterDemoWorkspace } from "@/app/app/actions";

const ERROR_COPY: Record<string, string> = {
  name_required: "Enter a name to continue.",
  not_configured: "The server has no demo session token configured — authentication is failing closed rather than letting anyone in.",
};

export function DemoLogin({ error }: { error?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <MarkedWordmark />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="warn">Hackathon demo authentication</Badge>
          </div>
          <h1 className="mb-2 text-lg font-semibold">Enter the demo workspace</h1>
          <p className="mb-5 text-sm text-[var(--muted)]">
            Mutating actions (arming, approving, disarming a fulfillment) require an authenticated actor. This is a
            documented demo boundary — not production wallet authentication. Type a name; nothing else is required.
          </p>
          <form action={enterDemoWorkspace} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--muted)]">Your name</span>
              <input
                name="actorName"
                required
                autoFocus
                placeholder="e.g. judge, operator-1"
                className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </label>
            <button
              type="submit"
              className="mt-1 rounded-lg bg-[var(--accent-strong)] px-4 py-2.5 text-sm font-medium text-black transition hover:bg-[var(--accent)]"
            >
              Enter demo workspace →
            </button>
          </form>
          {error ? <p className="mt-4 text-sm text-[var(--danger)]">{ERROR_COPY[error] ?? "Something went wrong."}</p> : null}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          Read-only pages — the public receipt, evidence, docs — never require this.
        </p>
      </div>
    </main>
  );
}
