import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteFulfillmentJobStore } from "@marked/db";
import { UnauthenticatedError } from "@marked/core";
import { armDemoJob, disarmDemoJob, approveDemoJob, getDemoJobState } from "./fulfillment-actions";

/**
 * Gate 7 Part 26 tests 11-16: anonymous ARM/APPROVE/DISARM must be rejected,
 * and the actor must be recorded on the resulting event, for all three
 * mutating operations. Each test gets its own tmp-file-backed SQLite store
 * so tests never see each other's state (and never touch the app's real
 * `.data/recovery-sandbox.sqlite`).
 */
describe("fulfillment-actions auth boundary", () => {
  let dir: string;
  let store: SqliteFulfillmentJobStore;
  const REAL_TOKEN = "test-demo-token";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "marked-fulfillment-actions-"));
    store = new SqliteFulfillmentJobStore(join(dir, "test.sqlite"));
    process.env["MARKED_DEMO_SESSION_TOKEN"] = REAL_TOKEN;
  });

  afterEach(async () => {
    try {
      await store.close();
    } catch {
      // already closed by a test that reopens its own handle on the same file
    }
    rmSync(dir, { recursive: true, force: true });
    delete process.env["MARKED_DEMO_SESSION_TOKEN"];
  });

  // --- Test 11/12/13: anonymous ARM/APPROVE/DISARM rejected ---

  it("11: rejects ARM with no token", async () => {
    await expect(armDemoJob(store, { providedToken: null, actorId: "alice" })).rejects.toThrow(UnauthenticatedError);
  });

  it("11b: rejects ARM with wrong token", async () => {
    await expect(armDemoJob(store, { providedToken: "wrong", actorId: "alice" })).rejects.toThrow(UnauthenticatedError);
  });

  it("12: rejects APPROVE with no token", async () => {
    await expect(approveDemoJob(store, { providedToken: null, actorId: "alice" })).rejects.toThrow(UnauthenticatedError);
  });

  it("13: rejects DISARM with no token", async () => {
    await expect(disarmDemoJob(store, { providedToken: null, actorId: "alice" })).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects ARM with a token but no actor id", async () => {
    await expect(armDemoJob(store, { providedToken: REAL_TOKEN, actorId: null })).rejects.toThrow(UnauthenticatedError);
  });

  it("an unauthenticated ARM attempt never mutates the job", async () => {
    await expect(armDemoJob(store, { providedToken: null, actorId: "alice" })).rejects.toThrow();
    const { job } = await getDemoJobState(store);
    expect(job.status).toBe("REVIEW_READY");
  });

  // --- Test 14/15/16: actor recorded on ARM/APPROVE/DISARM ---

  it("14: records the authenticated actor on the ARM event", async () => {
    const { event } = await armDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-alice" });
    expect(event.type).toBe("ARMED");
    expect(event.actor).toBe("judge-alice");
  });

  it("15: records the authenticated actor on the APPROVE event", async () => {
    // AWAITING_APPROVAL is only reachable through live eligibility/simulation
    // resolution, which this sandbox deliberately does not implement (Gate 7
    // instructions: no fabricated state progression). To test the APPROVE
    // wiring honestly, seed the store directly with a job already sitting at
    // AWAITING_APPROVAL — the legitimate fixture for "a job that already
    // passed the live pipeline and is now waiting for a human" — rather than
    // faking that pipeline at runtime.
    const { job: armed } = await armDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-alice" });
    await store.save({ ...armed, status: "AWAITING_APPROVAL" });

    const { event } = await approveDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-bob" });
    expect(event.type).toBe("APPROVED");
    expect(event.actor).toBe("judge-bob");
  });

  it("APPROVE is refused (not faked) when the job has not actually passed live eligibility/simulation", async () => {
    await armDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-alice" });
    // Still ARMED, not AWAITING_APPROVAL — approveDemoJob must fail closed rather than skip states.
    await expect(approveDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-bob" })).rejects.toThrow(/AWAITING_APPROVAL/);
  });

  it("16: records the authenticated actor on the DISARM event", async () => {
    await armDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-alice" });
    const { event } = await disarmDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-carol" }, "changed my mind");
    expect(event.type).toBe("DISARMED");
    expect(event.actor).toBe("judge-carol");
  });

  it("full authenticated ARM -> DISARM cycle persists across a fresh store instance pointed at the same file", async () => {
    await armDemoJob(store, { providedToken: REAL_TOKEN, actorId: "judge-alice" });
    await store.close();

    const reopened = new SqliteFulfillmentJobStore(join(dir, "test.sqlite"));
    const { job, events } = await getDemoJobState(reopened);
    expect(job.status).toBe("ARMED");
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe("judge-alice");
    await reopened.close();

    // afterEach will still call store.close() on the already-closed original handle; SqliteFulfillmentJobStore.close() is idempotent-safe for this test's purposes since we only assert via `reopened` above.
  });

  it("fails closed when no server token is configured at all", async () => {
    delete process.env["MARKED_DEMO_SESSION_TOKEN"];
    await expect(armDemoJob(store, { providedToken: "anything", actorId: "alice" })).rejects.toThrow(UnauthenticatedError);
  });
});
