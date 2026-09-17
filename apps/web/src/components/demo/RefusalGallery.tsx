import { Badge } from "@/components/ui/Badge";
import { Card, CardLabel } from "@/components/ui/Card";

import type { FulfillmentStatus } from "@marked/core";

export const REFUSALS: { title: string; code: FulfillmentStatus; copy: string }[] = [
  {
    title: "Too early",
    code: "REFUSAL_TIMELOCK_PENDING",
    copy: "The Governor timelock has not yet elapsed. Marked will not submit an execution before the proposal is actually executable.",
  },
  {
    title: "Authorization changed",
    code: "REFUSAL_PAYLOAD_MISMATCH",
    copy: "The Governor's calldata at execution time no longer matches the frozen commitment. Marked refuses rather than executing a different action than the one it armed.",
  },
  {
    title: "Simulation failure",
    code: "REFUSAL_SIMULATION_REVERT",
    copy: "KeeperHub's pre-flight simulation reverted. Marked will not submit a transaction expected to fail onchain.",
  },
  {
    title: "Caller incompatible",
    code: "BLOCKED_CALLER_NOT_AUTHORIZED",
    copy: "The execution surface's caller does not match the deployment KeeperHub is authorized to act through. Marked refuses to route around the authority boundary.",
  },
  {
    title: "Unsupported verification",
    code: "POSTCONDITION_UNSUPPORTED",
    copy: "The action's economic effect has no adapter with full coverage. Marked will not claim MARKED ✓ for an effect it cannot independently verify.",
  },
];

/**
 * Illustrative — these are Marked's productized refusal states, not a result
 * produced by the Gate 5/6 proof on this page (which succeeded end-to-end).
 */
export function RefusalGallery() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">When Marked refuses</h2>
        <Badge>Illustrative — not triggered in this proof</Badge>
      </div>
      <p className="text-sm text-[var(--muted)]">
        Marked is fail-closed. These are the productized refusal states the fulfillment engine can reach — the proof
        on this page did not hit any of them.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {REFUSALS.map((r) => (
          <Card key={r.code} className="border-amber-900/40">
            <CardLabel>{r.title}</CardLabel>
            <p className="text-sm text-[var(--muted)]">{r.copy}</p>
            <p className="font-mono-num mt-3 text-xs text-[var(--warn)]">{r.code}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
