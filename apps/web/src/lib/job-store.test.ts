import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FulfillmentCommitment } from "@marked/core";
import { getAppStore, resetAppStoreForTests, ensureSandboxSeedJob, RECOVERY_SANDBOX_JOB_ID, jobIdForCoordinate, ensureReviewReadyJob } from "./job-store";

const DATA_DIR = join(process.cwd(), ".data");
const EVIDENCE_ROOT = join(process.cwd(), "..", "..", "evidence");

afterEach(async () => {
  await resetAppStoreForTests();
  try {
    if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    // Windows can briefly hold the sqlite file handle after close(); best-effort cleanup only.
  }
});

/**
 * Gate 7 Part 26 test 30 / Gate 9R: no UI path can mutate canonical proof
 * evidence. The application database lives under `apps/web/.data/`,
 * structurally separate from `evidence/` — this test proves it by actually
 * running a write and checking where the resulting file landed.
 */
describe("job-store write boundary", () => {
  it("30: the app database lives outside evidence/, and creating it never touches evidence/", async () => {
    const before = existsSync(EVIDENCE_ROOT) ? new Set(await import("node:fs").then((fs) => fs.readdirSync(EVIDENCE_ROOT))) : new Set();

    const store = getAppStore();
    await ensureSandboxSeedJob(store);
    const job = await store.get(RECOVERY_SANDBOX_JOB_ID);

    expect(job).not.toBeNull();
    expect(existsSync(join(DATA_DIR, "marked.sqlite"))).toBe(true);
    expect(DATA_DIR.startsWith(EVIDENCE_ROOT)).toBe(false);
    expect(EVIDENCE_ROOT.startsWith(DATA_DIR)).toBe(false);

    const after = existsSync(EVIDENCE_ROOT) ? new Set(await import("node:fs").then((fs) => fs.readdirSync(EVIDENCE_ROOT))) : new Set();
    expect(after).toEqual(before);
  });
});

describe("job-store — real-proposal job creation", () => {
  const COMMITMENT: FulfillmentCommitment = {
    version: 1,
    chainId: 1,
    governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: "220",
    frozenActionAuthorizationHash: "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
    selectedActionIndexes: [0],
    postconditionBindings: [],
    fulfillmentMode: "APPROVE",
    executionSurfaceId: "keeperhub-direct-contract-call-v1",
    executionPolicyVersion: "1",
  };

  it("jobIdForCoordinate is deterministic and lowercases the governor address", () => {
    const id1 = jobIdForCoordinate(1, "0xAbCdEf0000000000000000000000000000000001", "42");
    const id2 = jobIdForCoordinate(1, "0xabcdef0000000000000000000000000000000001", "42");
    expect(id1).toBe(id2);
    expect(id1).toBe("1-0xabcdef0000000000000000000000000000000001-42");
  });

  it("ensureReviewReadyJob creates a REVIEW_READY job exactly once and is idempotent on re-resolution", async () => {
    const store = getAppStore();
    // A unique-per-run proposal id — best-effort `.data/` cleanup can leave a prior run's
    // ARMED job behind on Windows (file-lock timing), and this test must not depend on a
    // clean slate to be meaningful.
    const uniqueCommitment: FulfillmentCommitment = { ...COMMITMENT, proposalId: String(220_000_000_000_000 + Date.now()) };
    const jobId = jobIdForCoordinate(1, uniqueCommitment.governor, uniqueCommitment.proposalId);
    const first = await ensureReviewReadyJob(store, { jobId, commitment: uniqueCommitment });
    expect(first.status).toBe("REVIEW_READY");

    // Simulate the job having since been armed by a user action.
    await store.save({ ...first, status: "ARMED" });

    // Re-resolving the same proposal (e.g. the user pastes the URL again) must not reset an already-armed job.
    const second = await ensureReviewReadyJob(store, { jobId, commitment: uniqueCommitment });
    expect(second.status).toBe("ARMED");
  });
});
