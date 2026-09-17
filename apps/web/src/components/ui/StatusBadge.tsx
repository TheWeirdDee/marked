import type { FulfillmentStatus } from "@marked/core";
import { Badge } from "./Badge";

/**
 * Gate 9R Part 34 — product-language labels for the internal state machine.
 * A raw enum string is never the primary label a user sees; the technical
 * status is still available (job.status itself) for detail drawers.
 */
const LABELS: Record<FulfillmentStatus, string> = {
  NEW: "New",
  CACTUS_RESOLVED: "Resolving",
  AUTHORIZATION_RESOLVED: "Resolving",
  POSTCONDITION_BOUND: "Resolving",
  REVIEW_READY: "Review ready",
  ARMED: "Armed",
  WAITING_ELIGIBILITY: "Waiting",
  ELIGIBLE: "Eligible",
  VERIFYING_LIFECYCLE: "Verifying",
  VERIFYING_AUTHORIZATION: "Verifying",
  CAPTURING_PRESTATE: "Preparing",
  SIMULATING: "Simulating",
  AWAITING_APPROVAL: "Approval required",
  EXECUTING: "Executing",
  RECONCILING: "Reconciling",
  WAITING_FINALITY: "Waiting for finality",
  VERIFYING_GOVERNOR_STATE: "Verifying execution",
  VERIFYING_POSTCONDITION: "Verifying outcome",
  FULFILLED_VERIFIED: "Verified — MARKED ✓",
  REFUSAL_TIMELOCK_PENDING: "Waiting (timelock)",
  REFUSAL_CANCELED: "Refused — canceled",
  REFUSAL_NOT_EXECUTABLE: "Refused — not executable",
  REFUSAL_PAYLOAD_MISMATCH: "Refused — authorization changed",
  REFUSAL_SIMULATION_REVERT: "Refused — simulation failed",
  REFUSAL_WORKFLOW_POLICY_VIOLATION: "Refused — policy violation",
  DUPLICATE_SUPPRESSED: "Suppressed — duplicate",
  BLOCKED_INSUFFICIENT_GAS: "Blocked — gas",
  BLOCKED_CALLER_NOT_AUTHORIZED: "Blocked — caller",
  UNKNOWN_RECONCILING: "Reconciling",
  FULFILLED_EXTERNALLY_VERIFIED: "Verified — executed externally",
  FULFILLED_EXTERNALLY_UNVERIFIED: "Executed externally — unverified",
  FULFILLED_UNVERIFIED: "Unverified",
  POSTCONDITION_UNSUPPORTED: "Unsupported",
  DISARMED_BY_USER: "Disarmed",
  CACTUS_RESOLUTION_FAILED: "Failed — Cactus",
  AUTHORIZATION_RESOLUTION_FAILED: "Failed — authorization",
  GOVERNOR_EXECUTION_CONFIRMED: "Executed — verifying outcome",
};

const ACCENT_STATUSES = new Set<FulfillmentStatus>(["FULFILLED_VERIFIED", "FULFILLED_EXTERNALLY_VERIFIED", "ARMED", "ELIGIBLE", "REVIEW_READY"]);
const DANGER_STATUSES = new Set<FulfillmentStatus>([
  "REFUSAL_CANCELED",
  "REFUSAL_NOT_EXECUTABLE",
  "REFUSAL_PAYLOAD_MISMATCH",
  "REFUSAL_SIMULATION_REVERT",
  "REFUSAL_WORKFLOW_POLICY_VIOLATION",
  "BLOCKED_INSUFFICIENT_GAS",
  "BLOCKED_CALLER_NOT_AUTHORIZED",
  "CACTUS_RESOLUTION_FAILED",
  "AUTHORIZATION_RESOLUTION_FAILED",
  "DUPLICATE_SUPPRESSED",
]);
const WARN_STATUSES = new Set<FulfillmentStatus>([
  "WAITING_ELIGIBILITY",
  "REFUSAL_TIMELOCK_PENDING",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "RECONCILING",
  "UNKNOWN_RECONCILING",
  "WAITING_FINALITY",
  "SIMULATING",
  "VERIFYING_LIFECYCLE",
  "VERIFYING_AUTHORIZATION",
  "VERIFYING_GOVERNOR_STATE",
  "VERIFYING_POSTCONDITION",
  "CAPTURING_PRESTATE",
  "FULFILLED_UNVERIFIED",
  "FULFILLED_EXTERNALLY_UNVERIFIED",
  "GOVERNOR_EXECUTION_CONFIRMED",
  "POSTCONDITION_UNSUPPORTED",
  "DISARMED_BY_USER",
]);

export function statusLabel(status: FulfillmentStatus): string {
  return LABELS[status];
}

export function StatusBadge({ status }: { status: FulfillmentStatus }) {
  const tone = ACCENT_STATUSES.has(status) ? "accent" : DANGER_STATUSES.has(status) ? "danger" : WARN_STATUSES.has(status) ? "warn" : "neutral";
  return <Badge tone={tone}>{LABELS[status]}</Badge>;
}
