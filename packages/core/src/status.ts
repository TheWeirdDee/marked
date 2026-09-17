import { z } from "zod";

/**
 * Marked fulfillment state machine — PRD.md §10 "State machine".
 *
 * This is the complete named status set. Happy-path statuses progress in
 * the order listed in the PRD. Named outcomes are refusal, block,
 * reconciliation, or external-completion states that must exist as
 * first-class product surfaces, not only log lines (PRD Law 8: "Every
 * refusal is a product result.").
 *
 * "MARKED ✓" (PRD header table, human-facing terminal state) is the display
 * label shown when status === "FULFILLED_VERIFIED"; it is not a distinct
 * internal status. See `isMarked()` below.
 */

export const HAPPY_PATH_STATUSES = [
  "NEW",
  "CACTUS_RESOLVED",
  "AUTHORIZATION_RESOLVED",
  "POSTCONDITION_BOUND",
  "REVIEW_READY",
  "ARMED",
  "WAITING_ELIGIBILITY",
  "ELIGIBLE",
  "VERIFYING_LIFECYCLE",
  "VERIFYING_AUTHORIZATION",
  "CAPTURING_PRESTATE",
  "SIMULATING",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "RECONCILING",
  "WAITING_FINALITY",
  "VERIFYING_GOVERNOR_STATE",
  "VERIFYING_POSTCONDITION",
  "FULFILLED_VERIFIED",
] as const;

/**
 * `GOVERNOR_EXECUTION_CONFIRMED` — added in Gate 5. The strongest terminal
 * success Gate 5 itself may reach: the exact, authority-preserving Governor
 * lifecycle call (e.g. Bravo's `execute(proposalId)`) was submitted through
 * KeeperHub, included, and the Governor now independently reports the
 * proposal Executed. It is deliberately NOT in `TERMINAL_STATUSES` below —
 * unlike a refusal or block, it has exactly one legal forward edge (to
 * `VERIFYING_POSTCONDITION`) for whenever Gate 6's economic-verification
 * pipeline picks the job up. It must never be treated as, compared to, or
 * silently upgraded into `FULFILLED_VERIFIED` — Governor state alone is not
 * economic truth (PRD Invariant 11), and Gate 6 owns that verification.
 */
export const NAMED_OUTCOME_STATUSES = [
  "REFUSAL_TIMELOCK_PENDING",
  "REFUSAL_CANCELED",
  "REFUSAL_NOT_EXECUTABLE",
  "REFUSAL_PAYLOAD_MISMATCH",
  "REFUSAL_SIMULATION_REVERT",
  "REFUSAL_WORKFLOW_POLICY_VIOLATION",
  "DUPLICATE_SUPPRESSED",
  "BLOCKED_INSUFFICIENT_GAS",
  "BLOCKED_CALLER_NOT_AUTHORIZED",
  "UNKNOWN_RECONCILING",
  "FULFILLED_EXTERNALLY_VERIFIED",
  "FULFILLED_EXTERNALLY_UNVERIFIED",
  "FULFILLED_UNVERIFIED",
  "POSTCONDITION_UNSUPPORTED",
  "DISARMED_BY_USER",
  "CACTUS_RESOLUTION_FAILED",
  "AUTHORIZATION_RESOLUTION_FAILED",
  "GOVERNOR_EXECUTION_CONFIRMED",
] as const;

export const ALL_FULFILLMENT_STATUSES = [
  ...HAPPY_PATH_STATUSES,
  ...NAMED_OUTCOME_STATUSES,
] as const;

export type FulfillmentStatus = (typeof ALL_FULFILLMENT_STATUSES)[number];

export const FulfillmentStatusSchema = z.enum(ALL_FULFILLMENT_STATUSES);

/**
 * Terminal statuses: the state machine does not transition further from
 * these without creating a new commitment (for ARMED-and-mutated cases) or
 * a fresh job. `AWAITING_APPROVAL` is intentionally excluded — it always
 * continues.
 */
export const TERMINAL_STATUSES: ReadonlySet<FulfillmentStatus> = new Set([
  "FULFILLED_VERIFIED",
  "REFUSAL_TIMELOCK_PENDING",
  "REFUSAL_CANCELED",
  "REFUSAL_NOT_EXECUTABLE",
  "REFUSAL_PAYLOAD_MISMATCH",
  "REFUSAL_SIMULATION_REVERT",
  "REFUSAL_WORKFLOW_POLICY_VIOLATION",
  "DUPLICATE_SUPPRESSED",
  "BLOCKED_INSUFFICIENT_GAS",
  "BLOCKED_CALLER_NOT_AUTHORIZED",
  "FULFILLED_EXTERNALLY_VERIFIED",
  "FULFILLED_EXTERNALLY_UNVERIFIED",
  "FULFILLED_UNVERIFIED",
  "POSTCONDITION_UNSUPPORTED",
  "DISARMED_BY_USER",
  "CACTUS_RESOLUTION_FAILED",
  "AUTHORIZATION_RESOLUTION_FAILED",
]);

/**
 * `REFUSAL_TIMELOCK_PENDING` is documented in the PRD as "wait, not a dead
 * end, for an armed AUTO job" — it is terminal only in the sense that no
 * further automatic transition happens until the next eligibility check,
 * not in the sense the job is abandoned. Callers that need "is this job
 * still alive and will be rechecked" should treat this status specially
 * rather than relying on TERMINAL_STATUSES alone.
 */
export const WAITING_NOT_DEAD_STATUSES: ReadonlySet<FulfillmentStatus> = new Set([
  "REFUSAL_TIMELOCK_PENDING",
]);

/**
 * The human-facing terminal state "MARKED ✓" is FULFILLED_VERIFIED with
 * full required postcondition coverage already enforced by the state
 * machine before that transition is legal (PRD Invariant 12, Invariant 30).
 * This helper exists so no UI surface invents its own "is this marked"
 * check against a partial status list.
 */
export function isMarked(status: FulfillmentStatus): boolean {
  return status === "FULFILLED_VERIFIED";
}

export function isTerminal(status: FulfillmentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
