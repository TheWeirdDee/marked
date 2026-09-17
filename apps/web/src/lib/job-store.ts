import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SqliteFulfillmentJobStore, PostgresFulfillmentJobStore, PersistenceConfigurationError, type FulfillmentJobStore } from "@marked/db";
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
 *
 * Gate 11 — explicit storage-driver selection via `MARKED_STORAGE_DRIVER`
 * ("sqlite" | "postgres", defaulting to "sqlite" — every environment this
 * app ran in before this gate used SQLite, so that remains the unconfigured
 * default). This function returns the `FulfillmentJobStore` abstraction,
 * never a concrete class — business logic must not know which database is
 * underneath it (Gate 11 §3). `postgres` selected without `DATABASE_URL`
 * set throws `PersistenceConfigurationError` rather than silently falling
 * back to ephemeral SQLite (Gate 11 §9 — this is load-bearing on Vercel,
 * where SQLite cannot serve as durable storage at all; see
 * VERCEL_ENVIRONMENT.md).
 */
const DATA_DIR = join(process.cwd(), ".data");
const DB_PATH = join(DATA_DIR, "marked.sqlite");

let storeSingleton: FulfillmentJobStore | null = null;

function buildStore(): FulfillmentJobStore {
  const driver = process.env["MARKED_STORAGE_DRIVER"] ?? "sqlite";

  if (driver === "postgres") {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      throw new PersistenceConfigurationError(
        'MARKED_STORAGE_DRIVER=postgres but DATABASE_URL is not set. Refusing to silently fall back to SQLite — set DATABASE_URL, or unset MARKED_STORAGE_DRIVER to use local SQLite. See VERCEL_ENVIRONMENT.md.',
      );
    }
    return new PostgresFulfillmentJobStore(databaseUrl);
  }

  if (driver !== "sqlite") {
    throw new PersistenceConfigurationError(`MARKED_STORAGE_DRIVER must be "sqlite" or "postgres" (or unset) — got "${driver}".`);
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return new SqliteFulfillmentJobStore(DB_PATH);
}

export function getAppStore(): FulfillmentJobStore {
  if (!storeSingleton) {
    storeSingleton = buildStore();
  }
  return storeSingleton;
}

/** Test-only: closes and forgets the module-level singleton so the next `getAppStore()` call opens a fresh connection — needed because each test wants an isolated, freshly-deleted `.data` directory. */
export async function resetAppStoreForTests(): Promise<void> {
  try {
    await storeSingleton?.close();
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
export async function ensureSandboxSeedJob(store: FulfillmentJobStore): Promise<FulfillmentJob> {
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
  store: FulfillmentJobStore,
  params: { jobId: string; commitment: FulfillmentCommitment },
): Promise<FulfillmentJob> {
  const existing = await store.get(params.jobId);
  if (existing) return existing;
  const job = createReviewReadyJob({ jobId: params.jobId, commitment: params.commitment, now: new Date().toISOString() });
  await store.save(job);
  return job;
}
