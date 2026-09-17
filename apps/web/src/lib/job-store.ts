import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SqliteFulfillmentJobStore } from "@marked/db";
import type { FulfillmentCommitment, FulfillmentJob } from "@marked/core";
import { createReviewReadyJob } from "@marked/core";
import { loadLane2Gate5 } from "./evidence";

/**
 * Gate 9R — the application's one durable job store. Originally
 * `demo-store.ts` (Gate 7), scoped to a single hardcoded sandbox job;
 * generalized here to back the real `/app/new` intake flow as well, so a
 * freshly-resolved real governance proposal and the Gate 5 recovery-sandbox
 * fixture are both ordinary rows in the same table, not two parallel
 * systems.
 */
const DATA_DIR = join(process.cwd(), ".data");
const DB_PATH = join(DATA_DIR, "marked.sqlite");

let storeSingleton: SqliteFulfillmentJobStore | null = null;

export function getAppStore(): SqliteFulfillmentJobStore {
  if (!storeSingleton) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    storeSingleton = new SqliteFulfillmentJobStore(DB_PATH);
  }
  return storeSingleton;
}

/** Test-only: closes and forgets the module-level singleton so the next `getAppStore()` call opens a fresh connection — needed because each test wants an isolated, freshly-deleted `.data` directory. */
export function resetAppStoreForTests(): void {
  try {
    storeSingleton?.close();
  } catch {
    // already closed
  }
  storeSingleton = null;
}

/**
 * Reuses Gate 5's real frozen commitment fields (same governor, proposal,
 * authorization hash, postcondition binding) so the sandbox is never
 * fabricated — but it is a separate logical job, never armed toward
 * KeeperHub, and never presented as the canonical Gate 5/6 proof. See
 * `evidence/recovery-hardening/`.
 */
export const RECOVERY_SANDBOX_JOB_ID = "recovery-sandbox-demo-job";

function buildSandboxSeedCommitment(): FulfillmentCommitment {
  const { proof } = loadLane2Gate5();
  if (!proof) throw new Error("Gate 5 evidence is required to seed the recovery sandbox job.");
  const c = proof.commitment;
  return {
    version: 1,
    chainId: c.chainId,
    governor: c.governor as `0x${string}`,
    governorFamily: c.governorFamily as FulfillmentCommitment["governorFamily"],
    proposalId: c.proposalId,
    frozenActionAuthorizationHash: c.frozenActionAuthorizationHash as `0x${string}`,
    selectedActionIndexes: c.selectedActionIndexes,
    postconditionBindings: c.postconditionBindings,
    fulfillmentMode: c.fulfillmentMode as FulfillmentCommitment["fulfillmentMode"],
    executionSurfaceId: c.executionSurfaceId,
    executionPolicyVersion: c.executionPolicyVersion,
  };
}

/** Idempotent — creates the sandbox job at REVIEW_READY exactly once (in whichever store is passed); returns the existing job on every later call. */
export async function ensureSandboxSeedJob(store: SqliteFulfillmentJobStore): Promise<FulfillmentJob> {
  const existing = await store.get(RECOVERY_SANDBOX_JOB_ID);
  if (existing) return existing;
  const job = createReviewReadyJob({
    jobId: RECOVERY_SANDBOX_JOB_ID,
    commitment: buildSandboxSeedCommitment(),
    now: new Date().toISOString(),
  });
  await store.save(job);
  return job;
}

export function getSandboxSeedCommitment(): FulfillmentCommitment {
  return buildSandboxSeedCommitment();
}

/** Deterministic job id for a resolved governance coordinate — re-resolving the same proposal always finds the same job rather than creating duplicates. */
export function jobIdForCoordinate(chainId: number, governor: string, proposalId: string): string {
  return `${chainId}-${governor.toLowerCase()}-${proposalId}`;
}

/**
 * Get-or-create a job at `REVIEW_READY` from a freshly-resolved commitment.
 * Never overwrites an existing job's current state — re-resolving a
 * proposal a user has already armed must not silently reset it back to
 * REVIEW_READY.
 */
export async function ensureReviewReadyJob(
  store: SqliteFulfillmentJobStore,
  params: { jobId: string; commitment: FulfillmentCommitment },
): Promise<FulfillmentJob> {
  const existing = await store.get(params.jobId);
  if (existing) return existing;
  const job = createReviewReadyJob({ jobId: params.jobId, commitment: params.commitment, now: new Date().toISOString() });
  await store.save(job);
  return job;
}
