import type { Hex } from "./types";
import type { FulfillmentJob } from "./fulfillment-job";
import type { FulfillmentStatus } from "./status";

/**
 * Gate 7 — recovery classification. Pure, synchronous functions; none of
 * them touch a network or a store. Each one answers exactly one of the
 * named scenarios from Gate 7 instructions Part 16 (A-I), and is designed
 * so the *decision* is testable in isolation from the I/O that supplies its
 * inputs (a persisted job, a KeeperHub status, a fresh RPC read).
 */

const PRE_EXECUTION_STATUSES: ReadonlySet<FulfillmentStatus> = new Set([
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
]);

/**
 * Scenario A — "Crash before submission." A job reloaded from durable
 * storage in any pre-`EXECUTING` status has, by construction, never had a
 * KeeperHub call made on its behalf (every write in this codebase happens
 * only from `EXECUTING` onward — see `armFulfillmentJob`/`approveFulfillmentJob`,
 * both synchronous, neither touching a network). It is always safe to
 * resume normal processing from exactly where it was.
 */
export function classifyRestartRecovery(job: FulfillmentJob): { safeToResume: true; reason: string } | { safeToResume: false; reason: string } {
  if (PRE_EXECUTION_STATUSES.has(job.status)) {
    return { safeToResume: true, reason: `Job status ${job.status} is pre-execution — no KeeperHub call could have been made yet. Safe to resume normal processing.` };
  }
  return {
    safeToResume: false,
    reason: `Job status ${job.status} is at or past EXECUTING — a KeeperHub call may already be in flight or completed. Do not resume as if nothing happened; enter execution recovery instead (classifyExecutionRecovery).`,
  };
}

export type KnownExecutionState = {
  /** Was a deterministic execution identity (Idempotency-Key / requestHash) persisted before the KeeperHub call was made? */
  hasPersistedExecutionIdentity: boolean;
  /** KeeperHub's own last-known status for this execution, if queryable. */
  keeperHubStatus: "completed" | "pending" | "unknown" | null;
  /** Is a transaction hash known (from KeeperHub's response or a fresh status query)? */
  hasTransactionHash: boolean;
  /** Has a transaction receipt been independently confirmed via RPC? */
  hasConfirmedReceipt: boolean;
};

export type ExecutionRecoveryOutcome = {
  status: "RECONCILING" | "WAITING_FINALITY" | "UNKNOWN_RECONCILING";
  mayResubmit: false;
  reason: string;
};

/**
 * Scenarios B, C, D — "Crash immediately after submission," "KeeperHub
 * timeout," "KeeperHub says completed but receipt unknown." All three
 * collapse to the same rule: never resubmit (the returned type has no
 * `mayResubmit: true` variant — resubmission is not an expressible
 * outcome), and classify based on exactly what is currently known.
 */
export function classifyExecutionRecovery(state: KnownExecutionState): ExecutionRecoveryOutcome {
  if (!state.hasPersistedExecutionIdentity) {
    // Should not happen by construction (identity is persisted before broadcast — Gate 5 Part 14), but fail closed rather than resubmit if it somehow did.
    return { status: "UNKNOWN_RECONCILING", mayResubmit: false, reason: "No persisted execution identity found for a job at/past EXECUTING — cannot safely determine what was attempted. Reconciling, never resubmitting blind." };
  }
  if (state.hasConfirmedReceipt) {
    return { status: "WAITING_FINALITY", mayResubmit: false, reason: "A transaction receipt has been independently confirmed. Proceeding to finality wait, not resubmission." };
  }
  if (state.hasTransactionHash) {
    return { status: "RECONCILING", mayResubmit: false, reason: "A transaction hash is known but its receipt has not yet been independently confirmed. Waiting for the receipt, never resubmitting." };
  }
  if (state.keeperHubStatus === "completed") {
    // Scenario D: KeeperHub says completed, but we have neither tx hash nor receipt yet.
    return { status: "UNKNOWN_RECONCILING", mayResubmit: false, reason: "KeeperHub reports 'completed' but no transaction hash or receipt is yet known to this process — remaining non-terminal until independently confirmed. 'Completed' alone cannot mark or justify a resubmission." };
  }
  // Scenario C: timeout / status unknown.
  return { status: "UNKNOWN_RECONCILING", mayResubmit: false, reason: "KeeperHub status is unknown or pending with no transaction hash yet (e.g. a timeout). Ambiguity is reconciled by querying the persisted execution identity and live Governor state — never by resubmitting with a new identity." };
}

/**
 * Scenario F — "Governor executed externally while Marked was offline."
 * `eligibilityOutcome` is expected to be `resolveBravoLifecycleEligibility`'s
 * `ALREADY_EXECUTED` (packages/governor) — this function only decides what
 * to do *given* that finding, never re-derives it.
 */
export function classifyExternalExecutionRecovery(params: { eligibilityOutcome: "ALREADY_EXECUTED"; knownExecutionTxHash: Hex | null }): {
  callKeeperHub: false;
  proceedToVerification: boolean;
  reason: string;
} {
  if (params.knownExecutionTxHash) {
    return {
      callKeeperHub: false,
      proceedToVerification: true,
      reason: "Governor already reports Executed and a specific execution transaction hash is known — proceeding directly to independent economic verification (Gate 6), never calling KeeperHub again.",
    };
  }
  return {
    callKeeperHub: false,
    proceedToVerification: false,
    reason: "Governor already reports Executed, but no specific execution transaction hash is known to this process — cannot proceed to verification without one (Gate 6's verifier requires a bound execution tx). Remains unresolved rather than guessing a transaction.",
  };
}

/**
 * Scenario H — "Reorg / finality regression." Compares a previously
 * observed block hash at a given height against a freshly re-fetched one
 * at that same height. `currentBlockHashAtSameHeight: null` models "that
 * block number is not yet available" (should not normally occur once
 * inclusion was observed, but handled fail-closed regardless).
 */
export function classifyFinalityRegression(params: { previouslyObservedBlockHash: Hex; currentBlockHashAtSameHeight: Hex | null }): {
  reorged: boolean;
  action: "REVERT_TO_RECONCILING" | "FINALITY_HOLDS";
  reason: string;
} {
  if (params.currentBlockHashAtSameHeight === null) {
    return { reorged: true, action: "REVERT_TO_RECONCILING", reason: "The previously observed inclusion block is no longer retrievable at that height — treating as a reorg. Reverting to RECONCILING; any prior FULFILLED_VERIFIED observation from before required finality must never be preserved." };
  }
  if (params.currentBlockHashAtSameHeight.toLowerCase() !== params.previouslyObservedBlockHash.toLowerCase()) {
    return { reorged: true, action: "REVERT_TO_RECONCILING", reason: `Block hash at the previously observed inclusion height changed (${params.previouslyObservedBlockHash} -> ${params.currentBlockHashAtSameHeight}) — a reorg occurred before required finality. Reverting to RECONCILING.` };
  }
  return { reorged: false, action: "FINALITY_HOLDS", reason: "Block hash at the inclusion height is unchanged — the prior observation still holds." };
}

/**
 * Scenario I — "Duplicate worker." A thin, documented wrapper around
 * whatever storage-level compare-and-set the current architecture provides
 * (see `packages/db/src/sqlite-fulfillment-job-store.ts`'s
 * `tryClaimExecution`) — kept here as a pure function so the *decision*
 * ("claimed => proceed, not claimed => suppress") is testable without a
 * database.
 */
export function resolveDuplicateWorkerOutcome(claim: { claimed: boolean }): "PROCEED" | "SUPPRESS_DUPLICATE" {
  return claim.claimed ? "PROCEED" : "SUPPRESS_DUPLICATE";
}
