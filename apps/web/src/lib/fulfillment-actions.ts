import {
  armFulfillmentJob,
  disarmFulfillmentJob,
  approveFulfillmentJob,
  requireAuthenticatedActor,
  type AuthenticatedActor,
  type FulfillmentJob,
  type FulfillmentJobEvent,
} from "@marked/core";
import type { FulfillmentJobStore } from "@marked/db";
import { RECOVERY_SANDBOX_JOB_ID, ensureSandboxSeedJob, getSandboxSeedCommitment } from "./job-store";
import { refreshAuthorizationHash } from "./governance";

/**
 * Gate 7/9R — the mutating logic behind ARM/APPROVE/DISARM, generalized
 * (Gate 9R) from a single hardcoded sandbox job to any job id, so a
 * genuinely-resolved real proposal and the Gate 5 recovery-sandbox fixture
 * both go through the same code path. Every function:
 *   1. authenticates first (fails closed, before touching the store),
 *   2. re-verifies live Governor authorization immediately before arming
 *      (never trusts the commitment's own frozen hash as "current"),
 *   3. calls the unmodified Gate 4 domain function,
 *   4. persists the returned job and its event atomically AND with a
 *      compare-and-set guard on the status this decision was computed from
 *      (Gate 12 §8 — `saveWithCas`, not `saveJobAndEvents`: two concurrent
 *      mutations racing from the same read snapshot — a double-click, two
 *      tabs, or an APPROVE racing a DISARM — must resolve to exactly one
 *      winner, with the loser told its action did not apply, rather than
 *      both silently "succeeding" and duplicating the event log or
 *      silently overwriting each other's outcome. Reproduced empirically
 *      in fulfillment-actions.test.ts before this fix; see
 *      evidence/system-audit/concurrency-audit.md).
 */

export type AuthParams = { providedToken: string | null | undefined; actorId: string | null | undefined };

function authenticate(params: AuthParams): AuthenticatedActor {
  return requireAuthenticatedActor({
    providedToken: params.providedToken,
    expectedToken: process.env["MARKED_DEMO_SESSION_TOKEN"] ?? "",
    actorId: params.actorId,
  });
}

export class JobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`No job found with id '${jobId}'.`);
    this.name = "JobNotFoundError";
  }
}

/** Gate 12 §8 — thrown when a mutation's compare-and-set loses a race: the job's status changed between this call's read and its write, so its computed transition no longer applies. The caller lost the race, not the system failing. */
export class ConcurrentJobModificationError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly expectedStatus: string,
    public readonly actualStatus: string | null,
  ) {
    super(
      `Job '${jobId}' was modified concurrently: expected status '${expectedStatus}' when this action was computed, but it is now '${actualStatus ?? "unknown"}'. This action was not applied — reload the job and retry if it is still appropriate.`,
    );
    this.name = "ConcurrentJobModificationError";
  }
}

async function saveWithCasOrThrow(store: FulfillmentJobStore, jobId: string, expectedCurrentStatus: FulfillmentJob["status"], nextJob: FulfillmentJob, event: FulfillmentJobEvent): Promise<void> {
  const result = await store.saveWithCas(nextJob, [event], expectedCurrentStatus);
  if (!result.ok) {
    throw new ConcurrentJobModificationError(jobId, expectedCurrentStatus, result.actualStatus);
  }
}

async function getJobOrThrow(store: FulfillmentJobStore, jobId: string): Promise<FulfillmentJob> {
  const job = await store.get(jobId);
  if (!job) throw new JobNotFoundError(jobId);
  return job;
}

export async function armJob(store: FulfillmentJobStore, jobId: string, auth: AuthParams): Promise<{ job: FulfillmentJob; event: FulfillmentJobEvent }> {
  const actor = authenticate(auth);
  const job = await getJobOrThrow(store, jobId);

  // Live re-verification immediately before arming — never trust the
  // commitment's own frozen hash as "current" (that would make the arm
  // check tautological). Mirrors Gate 5's "revalidate before write".
  const currentAuthorizationHash = await refreshAuthorizationHash({
    chainId: job.commitment.chainId,
    governor: job.commitment.governor,
    proposalId: job.commitment.proposalId,
  });

  const { job: nextJob, event } = armFulfillmentJob({
    job,
    reviewedCommitment: job.commitment,
    currentAuthorizationHash,
    currentPostconditionCoverage: "FULL",
    actor: actor.actorId,
    now: new Date().toISOString(),
  });

  await saveWithCasOrThrow(store, jobId, job.status, nextJob, event);
  return { job: nextJob, event };
}

export async function disarmJob(
  store: FulfillmentJobStore,
  jobId: string,
  auth: AuthParams,
  reason?: string | null,
): Promise<{ job: FulfillmentJob; event: FulfillmentJobEvent }> {
  const actor = authenticate(auth);
  const job = await getJobOrThrow(store, jobId);

  const { job: nextJob, event } = disarmFulfillmentJob({
    job,
    actor: actor.actorId,
    reason: reason ?? null,
    now: new Date().toISOString(),
  });

  await saveWithCasOrThrow(store, jobId, job.status, nextJob, event);
  return { job: nextJob, event };
}

export async function approveJob(store: FulfillmentJobStore, jobId: string, auth: AuthParams): Promise<{ job: FulfillmentJob; event: FulfillmentJobEvent }> {
  const actor = authenticate(auth);
  const job = await getJobOrThrow(store, jobId);

  const { job: nextJob, event } = approveFulfillmentJob({
    job,
    actor: actor.actorId,
    fulfillmentCommitmentHash: job.fulfillmentCommitmentHash,
    now: new Date().toISOString(),
  });

  await saveWithCasOrThrow(store, jobId, job.status, nextJob, event);
  return { job: nextJob, event };
}

export async function getJobState(store: FulfillmentJobStore, jobId: string): Promise<{ job: FulfillmentJob; events: readonly FulfillmentJobEvent[] } | null> {
  const job = await store.get(jobId);
  if (!job) return null;
  const events = await store.getEvents(jobId);
  return { job, events };
}

// --- Backward-compatible sandbox convenience wrappers (Gate 7's original surface) ---

export async function armDemoJob(store: FulfillmentJobStore, auth: AuthParams) {
  const actor = authenticate(auth);
  const job = await ensureSandboxSeedJob(store);
  const commitment = getSandboxSeedCommitment();
  const { job: nextJob, event } = armFulfillmentJob({
    job,
    reviewedCommitment: commitment,
    currentAuthorizationHash: commitment.frozenActionAuthorizationHash,
    currentPostconditionCoverage: "FULL",
    actor: actor.actorId,
    now: new Date().toISOString(),
  });
  await saveWithCasOrThrow(store, job.jobId, job.status, nextJob, event);
  return { job: nextJob, event };
}

export async function disarmDemoJob(store: FulfillmentJobStore, auth: AuthParams, reason?: string | null) {
  await ensureSandboxSeedJob(store);
  return disarmJob(store, RECOVERY_SANDBOX_JOB_ID, auth, reason);
}

export async function approveDemoJob(store: FulfillmentJobStore, auth: AuthParams) {
  await ensureSandboxSeedJob(store);
  return approveJob(store, RECOVERY_SANDBOX_JOB_ID, auth);
}

export async function getDemoJobState(store: FulfillmentJobStore): Promise<{ job: FulfillmentJob; events: readonly FulfillmentJobEvent[] }> {
  const job = await ensureSandboxSeedJob(store);
  const events = await store.getEvents(RECOVERY_SANDBOX_JOB_ID);
  return { job, events };
}
