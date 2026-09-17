import type { Hex } from "./types";
import type { PostconditionCoverage } from "./types";
import type { FulfillmentCommitment } from "./fulfillment-commitment";
import { computeFulfillmentCommitmentHash } from "./fulfillment-commitment";
import type { FulfillmentStatus } from "./status";
import { transition } from "./fulfillment-state-machine";

/**
 * Gate 4 domain layer: the job aggregate plus the only three operations
 * that may move it (arm, disarm, approve). Every operation here is
 * synchronous and touches no network client — that is the structural proof
 * that arming, disarming, and approving a job can never themselves perform
 * a KeeperHub call or any other network write (instructions §16/§28).
 */

export type FulfillmentJobId = string;

export type FulfillmentJob = {
  jobId: FulfillmentJobId;
  status: FulfillmentStatus;
  commitment: FulfillmentCommitment;
  fulfillmentCommitmentHash: Hex;
  createdAt: string;
  updatedAt: string;
};

type BaseEvent = {
  timestamp: string;
  previousState: FulfillmentStatus;
  nextState: FulfillmentStatus;
  fulfillmentCommitmentHash: Hex;
};

export type ArmEvent = BaseEvent & { type: "ARMED"; actor: string };
export type DisarmEvent = BaseEvent & { type: "DISARMED"; actor: string; reason: string | null };
export type ApprovalEvent = BaseEvent & { type: "APPROVED"; actor: string };

/** Append-only audit trail entry — see `packages/db/src/fulfillment-job-store.ts` for the persistence guarantee that these are never rewritten. */
export type FulfillmentJobEvent = ArmEvent | DisarmEvent | ApprovalEvent;

/**
 * Constructs a job already sitting at `REVIEW_READY` with a computed
 * commitment. Gate 4 does not implement the live orchestration that walks
 * `NEW → CACTUS_RESOLVED → AUTHORIZATION_RESOLVED → POSTCONDITION_BOUND →
 * REVIEW_READY` against real Cactus/Governor/postcondition reads — that
 * orchestration is a later gate's job, and each of those hops is already
 * proven independently legal by `fulfillment-state-machine.test.ts`. This
 * constructor represents the one moment Gate 4 actually needs: a commitment
 * is fully assembled and ready for human review, before anything is armed.
 */
export function createReviewReadyJob(params: { jobId: FulfillmentJobId; commitment: FulfillmentCommitment; now: string }): FulfillmentJob {
  return {
    jobId: params.jobId,
    status: "REVIEW_READY",
    commitment: params.commitment,
    fulfillmentCommitmentHash: computeFulfillmentCommitmentHash(params.commitment),
    createdAt: params.now,
    updatedAt: params.now,
  };
}

export type ArmRefusalCode = "COMMITMENT_HASH_MISMATCH" | "AUTHORIZATION_CHANGED" | "POSTCONDITION_COVERAGE_INCOMPLETE" | "POSTCONDITION_UNSUPPORTED";

export class ArmRefusedError extends Error {
  constructor(
    public readonly code: ArmRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "ArmRefusedError";
  }
}

export type ArmFulfillmentJobParams = {
  job: FulfillmentJob;
  /** The exact commitment the human reviewed — recomputed and compared against `job.fulfillmentCommitmentHash` before anything else happens (instructions §7.6/§7.3: "If commitment hash differs from reviewed commitment: REFUSE"). */
  reviewedCommitment: FulfillmentCommitment;
  /** A freshly re-resolved `actionAuthorizationHash` from the live Governor — the caller performs this read (packages/governor) before calling arm; this function never does network I/O itself. */
  currentAuthorizationHash: Hex;
  /** Freshly re-evaluated postcondition coverage — the caller performs this read before calling arm. */
  currentPostconditionCoverage: PostconditionCoverage;
  actor: string;
  now: string;
};

/**
 * Arming freezes the `FulfillmentCommitment` exactly as reviewed. Every one
 * of Gate 4 instructions §7's numbered requirements is enforced here,
 * fail-closed:
 *
 * 1. current Governor authorization is resolved — caller-supplied `currentAuthorizationHash`.
 * 2. current authorization hash equals the hash being armed — checked below.
 * 3. required postcondition coverage is FULL — checked below.
 * 4. supported postcondition semantics are bound — structural: `reviewedCommitment.postconditionBindings` already exists.
 * 5. fulfillment commitment is computed — `computeFulfillmentCommitmentHash` recomputed and compared.
 * 6. human mode is selected — `FulfillmentCommitment.fulfillmentMode` is a required field.
 * 7. immutable commitment is persisted — the caller's job store does this with the returned job.
 * 8. state moves to ARMED — via `transition()`, itself fail-closed.
 *
 * No KeeperHub call, no network I/O: this function is synchronous.
 */
export function armFulfillmentJob(params: ArmFulfillmentJobParams): { job: FulfillmentJob; event: ArmEvent } {
  const recomputedHash = computeFulfillmentCommitmentHash(params.reviewedCommitment);
  if (recomputedHash !== params.job.fulfillmentCommitmentHash) {
    throw new ArmRefusedError(
      "COMMITMENT_HASH_MISMATCH",
      `Reviewed commitment hashes to ${recomputedHash}, but the job under review is ${params.job.fulfillmentCommitmentHash}. Refusing to arm a commitment that was not actually reviewed.`,
    );
  }

  if (params.currentAuthorizationHash !== params.reviewedCommitment.frozenActionAuthorizationHash) {
    throw new ArmRefusedError(
      "AUTHORIZATION_CHANGED",
      `Live Governor authorization hash (${params.currentAuthorizationHash}) no longer matches the reviewed commitment's frozen authorization (${params.reviewedCommitment.frozenActionAuthorizationHash}). Refusing to arm a stale authorization.`,
    );
  }

  if (params.currentPostconditionCoverage !== "FULL") {
    throw new ArmRefusedError(
      params.currentPostconditionCoverage === "UNSUPPORTED" ? "POSTCONDITION_UNSUPPORTED" : "POSTCONDITION_COVERAGE_INCOMPLETE",
      `Postcondition coverage is ${params.currentPostconditionCoverage}, not FULL. Refusing to arm without full required coverage (PRD Invariant 30).`,
    );
  }

  const nextState = transition(params.job.status, "ARMED");

  const event: ArmEvent = {
    type: "ARMED",
    actor: params.actor,
    timestamp: params.now,
    previousState: params.job.status,
    nextState,
    fulfillmentCommitmentHash: params.job.fulfillmentCommitmentHash,
  };

  return {
    job: { ...params.job, status: nextState, updatedAt: params.now },
    event,
  };
}

const DISARMABLE_STATES: ReadonlySet<FulfillmentStatus> = new Set(["ARMED", "WAITING_ELIGIBILITY", "ELIGIBLE", "AWAITING_APPROVAL"]);

export class IllegalDisarmError extends Error {
  constructor(public readonly status: FulfillmentStatus) {
    super(
      `Cannot disarm from state ${status}. Disarm is only legal before broadcast begins (ARMED, WAITING_ELIGIBILITY, ELIGIBLE, AWAITING_APPROVAL) — ` +
        "once execution has begun, disarm cannot pretend to cancel a chain transaction (PRD J7.1).",
    );
    this.name = "IllegalDisarmError";
  }
}

export type DisarmFulfillmentJobParams = {
  job: FulfillmentJob;
  actor: string;
  reason?: string | null;
  now: string;
};

/** Authenticated logical disarm. Requires actor information even though Gate 4 does not implement production auth UI (instructions §8). */
export function disarmFulfillmentJob(params: DisarmFulfillmentJobParams): { job: FulfillmentJob; event: DisarmEvent } {
  if (!DISARMABLE_STATES.has(params.job.status)) {
    throw new IllegalDisarmError(params.job.status);
  }

  const nextState = transition(params.job.status, "DISARMED_BY_USER");

  const event: DisarmEvent = {
    type: "DISARMED",
    actor: params.actor,
    reason: params.reason ?? null,
    timestamp: params.now,
    previousState: params.job.status,
    nextState,
    fulfillmentCommitmentHash: params.job.fulfillmentCommitmentHash,
  };

  return {
    job: { ...params.job, status: nextState, updatedAt: params.now },
    event,
  };
}

export class IllegalApprovalError extends Error {
  constructor(public readonly status: FulfillmentStatus) {
    super(`Cannot approve from state ${status}. Approval is only legal from AWAITING_APPROVAL.`);
    this.name = "IllegalApprovalError";
  }
}

export class ApprovalHashMismatchError extends Error {
  constructor(
    public readonly approvedHash: Hex,
    public readonly jobHash: Hex,
  ) {
    super(
      `Approval was given for commitment hash ${approvedHash}, but the job's current commitment hash is ${jobHash}. ` +
        'Approval means "I approve this exact frozen commitment," never "execute whatever is current" — refusing.',
    );
    this.name = "ApprovalHashMismatchError";
  }
}

export type ApproveFulfillmentJobParams = {
  job: FulfillmentJob;
  actor: string;
  /** The commitment hash the human is approving — must equal `job.fulfillmentCommitmentHash` exactly. */
  fulfillmentCommitmentHash: Hex;
  now: string;
};

/** APPROVE-mode approval, bound to the exact frozen commitment hash — never a generic "yes, proceed." */
export function approveFulfillmentJob(params: ApproveFulfillmentJobParams): { job: FulfillmentJob; event: ApprovalEvent } {
  if (params.job.status !== "AWAITING_APPROVAL") {
    throw new IllegalApprovalError(params.job.status);
  }
  if (params.fulfillmentCommitmentHash !== params.job.fulfillmentCommitmentHash) {
    throw new ApprovalHashMismatchError(params.fulfillmentCommitmentHash, params.job.fulfillmentCommitmentHash);
  }

  const nextState = transition(params.job.status, "EXECUTING");

  const event: ApprovalEvent = {
    type: "APPROVED",
    actor: params.actor,
    timestamp: params.now,
    previousState: params.job.status,
    nextState,
    fulfillmentCommitmentHash: params.job.fulfillmentCommitmentHash,
  };

  return {
    job: { ...params.job, status: nextState, updatedAt: params.now },
    event,
  };
}
