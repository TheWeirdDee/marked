import type { FulfillmentMode } from "./types";
import type { FulfillmentStatus } from "./status";

/**
 * Gate 4 — the transition table is code, not convention (instructions §6).
 * A state string being assigned somewhere in application code must not by
 * itself constitute a valid transition; only `transition()` may produce a
 * new status, and it fails closed on anything not in this table.
 *
 * Reuses the exact status names already defined in `status.ts` (Gate 0) —
 * no duplicate or contradictory naming introduced here.
 */

export type TransitionContext = {
  /** Required to resolve the one mode-dependent branch point (`SIMULATING` → `AWAITING_APPROVAL` for APPROVE, or → `EXECUTING` for AUTO). Omitting it makes both branches illegal — an ambiguous mode is never silently permitted through either path. */
  fulfillmentMode?: FulfillmentMode;
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: FulfillmentStatus,
    public readonly to: FulfillmentStatus,
    reason?: string,
  ) {
    super(`Illegal fulfillment state transition: ${from} -> ${to}.${reason ? ` ${reason}` : ""}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Unconditional legal edges — legal regardless of `TransitionContext`.
 * Documented per-edge because each one encodes a real product decision
 * about when a named outcome may be entered, not merely "anything goes."
 */
const UNCONDITIONAL_EDGES: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  NEW: ["CACTUS_RESOLVED", "CACTUS_RESOLUTION_FAILED"],
  CACTUS_RESOLVED: ["AUTHORIZATION_RESOLVED", "AUTHORIZATION_RESOLUTION_FAILED"],
  AUTHORIZATION_RESOLVED: ["POSTCONDITION_BOUND", "POSTCONDITION_UNSUPPORTED"],
  POSTCONDITION_BOUND: ["REVIEW_READY"],
  REVIEW_READY: ["ARMED"],
  ARMED: ["WAITING_ELIGIBILITY", "DISARMED_BY_USER"],
  // REFUSAL_TIMELOCK_PENDING is "waiting, not dead" (status.ts WAITING_NOT_DEAD_STATUSES) — the only named outcome with an outgoing edge, back to the same eligibility check that produced it.
  WAITING_ELIGIBILITY: ["ELIGIBLE", "REFUSAL_TIMELOCK_PENDING", "REFUSAL_CANCELED", "REFUSAL_NOT_EXECUTABLE", "DISARMED_BY_USER"],
  REFUSAL_TIMELOCK_PENDING: ["WAITING_ELIGIBILITY"],
  ELIGIBLE: ["VERIFYING_LIFECYCLE", "DISARMED_BY_USER"],
  // External-execution detection belongs here: the lifecycle check is where Marked would discover someone else already executed (PRD Invariant 10 — external fulfillment is user success, not raced against).
  VERIFYING_LIFECYCLE: [
    "VERIFYING_AUTHORIZATION",
    "REFUSAL_CANCELED",
    "REFUSAL_NOT_EXECUTABLE",
    "REFUSAL_TIMELOCK_PENDING",
    "FULFILLED_EXTERNALLY_VERIFIED",
    "FULFILLED_EXTERNALLY_UNVERIFIED",
  ],
  // The pre-write authorization recheck (PRD Invariant 28) — mismatch fails closed as REFUSAL_PAYLOAD_MISMATCH, never "repaired".
  VERIFYING_AUTHORIZATION: ["CAPTURING_PRESTATE", "REFUSAL_PAYLOAD_MISMATCH"],
  CAPTURING_PRESTATE: ["SIMULATING"],
  SIMULATING: [
    // AWAITING_APPROVAL / EXECUTING are mode-conditional — see CONDITIONAL_EDGE_RULES below, not listed here.
    "REFUSAL_SIMULATION_REVERT",
    "BLOCKED_INSUFFICIENT_GAS",
    "REFUSAL_WORKFLOW_POLICY_VIOLATION",
    "BLOCKED_CALLER_NOT_AUTHORIZED",
    "DUPLICATE_SUPPRESSED",
  ],
  AWAITING_APPROVAL: ["EXECUTING", "DISARMED_BY_USER"],
  EXECUTING: ["RECONCILING", "UNKNOWN_RECONCILING", "DUPLICATE_SUPPRESSED"],
  RECONCILING: ["WAITING_FINALITY", "UNKNOWN_RECONCILING"],
  UNKNOWN_RECONCILING: ["RECONCILING", "WAITING_FINALITY"],
  WAITING_FINALITY: ["VERIFYING_GOVERNOR_STATE"],
  // GOVERNOR_EXECUTION_CONFIRMED (Gate 5) is the alternative to continuing straight to
  // VERIFYING_POSTCONDITION — the resting point for a system where the postcondition
  // pipeline isn't wired to this execution yet (Gate 5's own scope boundary).
  VERIFYING_GOVERNOR_STATE: ["VERIFYING_POSTCONDITION", "GOVERNOR_EXECUTION_CONFIRMED"],
  // The only legal continuation from Gate 5's terminal point — never directly to FULFILLED_VERIFIED.
  GOVERNOR_EXECUTION_CONFIRMED: ["VERIFYING_POSTCONDITION"],
  // FULFILLED_UNVERIFIED belongs here, not earlier — PRD Invariant 14: "transaction succeeded, required postcondition did not."
  VERIFYING_POSTCONDITION: ["FULFILLED_VERIFIED", "FULFILLED_UNVERIFIED"],

  // Terminal — no outgoing edges.
  FULFILLED_VERIFIED: [],
  REFUSAL_CANCELED: [],
  REFUSAL_NOT_EXECUTABLE: [],
  REFUSAL_PAYLOAD_MISMATCH: [],
  REFUSAL_SIMULATION_REVERT: [],
  REFUSAL_WORKFLOW_POLICY_VIOLATION: [],
  DUPLICATE_SUPPRESSED: [],
  BLOCKED_INSUFFICIENT_GAS: [],
  BLOCKED_CALLER_NOT_AUTHORIZED: [],
  FULFILLED_EXTERNALLY_VERIFIED: [],
  FULFILLED_EXTERNALLY_UNVERIFIED: [],
  FULFILLED_UNVERIFIED: [],
  POSTCONDITION_UNSUPPORTED: [],
  DISARMED_BY_USER: [],
  CACTUS_RESOLUTION_FAILED: [],
  AUTHORIZATION_RESOLUTION_FAILED: [],
};

/** The one mode-dependent branch point. Both directions require an explicit, matching `fulfillmentMode` — never inferred, never defaulted. */
const CONDITIONAL_EDGES: readonly { from: FulfillmentStatus; to: FulfillmentStatus; requiresMode: FulfillmentMode }[] = [
  { from: "SIMULATING", to: "AWAITING_APPROVAL", requiresMode: "APPROVE" },
  { from: "SIMULATING", to: "EXECUTING", requiresMode: "AUTO" },
];

export function isLegalTransition(from: FulfillmentStatus, to: FulfillmentStatus, ctx: TransitionContext = {}): boolean {
  if (UNCONDITIONAL_EDGES[from]?.includes(to)) return true;
  const conditional = CONDITIONAL_EDGES.find((e) => e.from === from && e.to === to);
  if (conditional) return ctx.fulfillmentMode === conditional.requiresMode;
  return false;
}

/** Throws `IllegalTransitionError` rather than ever silently applying an illegal move — a state string being assigned in application code is never itself a valid transition. */
export function transition(from: FulfillmentStatus, to: FulfillmentStatus, ctx: TransitionContext = {}): FulfillmentStatus {
  if (!isLegalTransition(from, to, ctx)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}
