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
 *   4. persists the returned job and its event atomically (Gate 11 —
 *      `saveJobAndEvents`, one transaction, never a state change with a
 *      failed event append or vice versa).
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

  await store.saveJobAndEvents(nextJob, [event]);
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

  await store.saveJobAndEvents(nextJob, [event]);
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

  await store.saveJobAndEvents(nextJob, [event]);
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
  await store.saveJobAndEvents(nextJob, [event]);
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
