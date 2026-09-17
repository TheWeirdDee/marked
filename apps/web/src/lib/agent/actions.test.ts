import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppStore, resetAppStoreForTests, ensureReviewReadyJob } from "@/lib/job-store";
import type { FulfillmentCommitment } from "@marked/core";

const DATA_DIR = join(process.cwd(), ".data");

function anthropicResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
    text: async () => "",
  } as Response;
}

const COMMITMENT: FulfillmentCommitment = {
  version: 1,
  chainId: 11155111,
  governor: "0xe86cdc53f3c4f416be42f13f621be96ab9d30727",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "2",
  frozenActionAuthorizationHash: "0x2fe3f808910a5d89ff9d233d34ecd53fe66d89d3ce46e340891599e784167a3b",
  selectedActionIndexes: [0],
  postconditionBindings: [
    {
      actionIndex: 0,
      adapterId: "erc20-transfer",
      adapterVersion: "1",
      required: true,
      bindingParams: [
        { key: "token", value: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F" },
        { key: "recipient", value: "0xF02789155998f85D3a0b7dcA1525b059988Ab442" },
        { key: "rawAmount", value: "1000000000000000000000" },
      ],
    },
  ],
  fulfillmentMode: "APPROVE",
  executionSurfaceId: "keeperhub-direct-contract-call-v1",
  executionPolicyVersion: "1",
};

describe("agent actions — unavailable (no provider configured, the actual current state)", () => {
  it("askAboutProposal fails closed with a clear reason and never throws", async () => {
    const { askAboutProposal } = await import("./actions");
    const result = await askAboutProposal("https://www.tally.xyz/gov/compound/proposal/220", "What did this approve?");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not configured/i);
  });

  it("prepareCandidatePlan fails closed the same way", async () => {
    const { prepareCandidatePlan } = await import("./actions");
    const result = await prepareCandidatePlan("https://www.tally.xyz/gov/compound/proposal/220");
    expect(result.ok).toBe(false);
  });

  it("askAboutReceipt fails closed the same way", async () => {
    const { askAboutReceipt } = await import("./actions");
    const result = await askAboutReceipt("What happened?");
    expect(result.ok).toBe(false);
  });

  it("isAgentAvailable reports false", async () => {
    const { isAgentAvailable } = await import("./provider");
    expect(isAgentAvailable()).toBe(false);
  });
});

describe("agent actions — available (provider configured, fetch mocked — no real network call)", () => {
  const originalKey = process.env["ANTHROPIC_API_KEY"];
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "test-key-not-real";
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = originalKey;
    vi.unstubAllGlobals();
    try {
      resetAppStoreForTests();
    } catch {
      // ignore
    }
    try {
      if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Windows file-lock timing — best effort
    }
  });

  it("isAgentAvailable reports true once a key is present", async () => {
    const { isAgentAvailable } = await import("./provider");
    expect(isAgentAvailable()).toBe(true);
  });

  it("askAboutFulfillment returns the model's answer grounded in the job's real frozen commitment", async () => {
    fetchSpy.mockResolvedValueOnce(anthropicResponse("This fulfillment authorizes sending 1,000 raw units to the recipient in action 0."));

    const store = getAppStore();
    const jobId = "agent-test-job";
    await ensureReviewReadyJob(store, { jobId, commitment: COMMITMENT });

    const { askAboutFulfillment } = await import("./actions");
    const result = await askAboutFulfillment(jobId, "What does this authorize?");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.answer).toContain("1,000 raw units");

    // Zero-write guarantee: the job's status must be untouched by asking a question about it.
    const after = await store.get(jobId);
    expect(after?.status).toBe("REVIEW_READY");
  });

  it("askAboutFulfillment for a nonexistent job fails closed without creating one", async () => {
    const { askAboutFulfillment } = await import("./actions");
    const result = await askAboutFulfillment("does-not-exist", "hello");
    expect(result.ok).toBe(false);
    const store = getAppStore();
    expect(await store.get("does-not-exist")).toBeNull();
  });

  it("a benign candidate plan from the model validates successfully", async () => {
    fetchSpy.mockResolvedValueOnce(
      anthropicResponse(
        JSON.stringify({
          version: 1,
          explanation: "Single supported ERC20 transfer.",
          proposalSummary: "Send the authorized amount to the recipient.",
          suggestedActionIndexes: [0],
          executionExplanation: "KeeperHub will submit Governor.execute once eligible.",
          verificationExplanation: "Recipient balance must increase by exactly the authorized amount.",
          riskNotes: [],
        }),
      ),
    );

    vi.doMock("@/lib/governance", () => ({
      resolveGovernanceIntake: vi.fn().mockResolvedValue({
        cactus: { organization: { name: "Compound" }, proposal: { title: "t", url: "u", onchainProposalId: "220", status: "executed" } },
        coordinate: { chainId: 1, governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529", proposalId: "220" },
        familySupported: true,
        familyError: null,
        authorization: { authorization: { governorFamily: "GOVERNOR_BRAVO" } },
        eligibility: { outcome: "ALREADY_EXECUTED", reason: "x" },
        eligibilityError: null,
        actions: [{ actionIndex: 0, target: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F", signature: "transfer(address,uint256)", calldata: "0x", value: "0", decoded: { recipient: "0xF02789155998f85D3a0b7dcA1525b059988Ab442", amount: "1000000000000000000000" }, humanSummary: "s" }],
        postconditionCoverage: "FULL",
        fulfillability: { outcome: "ALREADY_EXECUTED", summary: "s", technicalReason: "t", canArm: true },
        commitment: null,
      }),
    }));

    vi.resetModules();
    const { prepareCandidatePlan } = await import("./actions");
    const result = await prepareCandidatePlan("https://www.tally.xyz/gov/compound/proposal/220");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.validation.ok).toBe(true);
    }
    vi.doUnmock("@/lib/governance");
  });

  it("a hallucinated candidate plan attempting to substitute the amount is rejected by the deterministic validator, not silently accepted", async () => {
    fetchSpy.mockResolvedValueOnce(
      anthropicResponse(
        JSON.stringify({
          version: 1,
          explanation: "I will send more than authorized.",
          proposalSummary: "s",
          suggestedActionIndexes: [0],
          executionExplanation: "e",
          verificationExplanation: "v",
          riskNotes: [],
          amount: "1500000000000000000000",
        }),
      ),
    );

    vi.doMock("@/lib/governance", () => ({
      resolveGovernanceIntake: vi.fn().mockResolvedValue({
        cactus: { organization: { name: "Compound" }, proposal: { title: "t", url: "u", onchainProposalId: "220", status: "executed" } },
        coordinate: { chainId: 1, governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529", proposalId: "220" },
        familySupported: true,
        familyError: null,
        authorization: { authorization: { governorFamily: "GOVERNOR_BRAVO" } },
        eligibility: { outcome: "ALREADY_EXECUTED", reason: "x" },
        eligibilityError: null,
        actions: [{ actionIndex: 0, target: "0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F", signature: "transfer(address,uint256)", calldata: "0x", value: "0", decoded: { recipient: "0xF02789155998f85D3a0b7dcA1525b059988Ab442", amount: "1000000000000000000000" }, humanSummary: "s" }],
        postconditionCoverage: "FULL",
        fulfillability: { outcome: "ALREADY_EXECUTED", summary: "s", technicalReason: "t", canArm: true },
        commitment: null,
      }),
    }));

    vi.resetModules();
    const { prepareCandidatePlan } = await import("./actions");
    const result = await prepareCandidatePlan("https://www.tally.xyz/gov/compound/proposal/220");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.validation.ok).toBe(false);
      if (!result.data.validation.ok) {
        expect(result.data.validation.code).toBe("SCHEMA_INVALID");
        expect(result.data.validation.reason).toContain("amount");
      }
    }
    vi.doUnmock("@/lib/governance");
  });
});
