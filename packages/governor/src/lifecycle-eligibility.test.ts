import { describe, expect, it } from "vitest";
import { resolveBravoLifecycleEligibility } from "./lifecycle-eligibility";
import { GovernorResolutionError } from "./errors";

const GOVERNOR = "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" as const;

/** proposals() auto-getter tuple: id, proposer, eta, startBlock, endBlock, forVotes, againstVotes, abstainVotes, canceled, executed. */
function proposalTuple(overrides: Partial<{ eta: bigint; canceled: boolean; executed: boolean }> = {}) {
  return [1n, "0x0000000000000000000000000000000000000001", overrides.eta ?? 0n, 10n, 20n, 100n, 0n, 0n, overrides.canceled ?? false, overrides.executed ?? false] as const;
}

function fakeClient(params: { state: number; proposal: readonly unknown[]; blockTimestamp: bigint; blockNumber?: bigint }) {
  const readContract = async ({ functionName }: { functionName: string }) => {
    if (functionName === "state") return params.state;
    if (functionName === "proposals") return params.proposal;
    throw new Error("unexpected call: " + functionName);
  };
  const getBlock = async () => ({ number: params.blockNumber ?? 1000n, timestamp: params.blockTimestamp });
  return { readContract, getBlock } as never;
}

describe("resolveBravoLifecycleEligibility — the full ProposalState decision tree (Gate 5 instructions Part 3 / §21 tests 1-10)", () => {
  it("Pending (0) refuses as NOT_EXECUTABLE", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 0, proposal: proposalTuple(), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_NOT_EXECUTABLE");
  });

  it("Active (1) refuses as NOT_EXECUTABLE", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 1, proposal: proposalTuple(), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_NOT_EXECUTABLE");
  });

  it("Defeated (3) refuses as NOT_EXECUTABLE", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 3, proposal: proposalTuple(), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_NOT_EXECUTABLE");
  });

  it("Succeeded but not queued (4) refuses as NOT_EXECUTABLE", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 4, proposal: proposalTuple(), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_NOT_EXECUTABLE");
  });

  it("Queued (5) before eta -> REFUSAL_TIMELOCK_PENDING", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 5, proposal: proposalTuple({ eta: 5000n }), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_TIMELOCK_PENDING");
  });

  it("Queued (5) after eta -> ELIGIBLE_TO_EXECUTE", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 5, proposal: proposalTuple({ eta: 500n }), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("ELIGIBLE_TO_EXECUTE");
  });

  it("Expired (6) refuses as NOT_EXECUTABLE", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 6, proposal: proposalTuple(), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_NOT_EXECUTABLE");
  });

  it("Canceled proposal refuses as REFUSAL_CANCELED regardless of raw state", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 5, proposal: proposalTuple({ eta: 500n, canceled: true }), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("REFUSAL_CANCELED");
  });

  it("Executed (7) / executed flag -> ALREADY_EXECUTED, suppressing duplicate submission", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 7, proposal: proposalTuple({ executed: true }), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n });
    expect(result.outcome).toBe("ALREADY_EXECUTED");
  });

  it("unknown/malformed state value fails closed rather than guessing", async () => {
    await expect(
      resolveBravoLifecycleEligibility(fakeClient({ state: 99, proposal: proposalTuple(), blockTimestamp: 1000n }), { governor: GOVERNOR, proposalId: 1n }),
    ).rejects.toBeInstanceOf(GovernorResolutionError);
  });
});

describe("resolveBravoLifecycleEligibility — evidence completeness", () => {
  it("includes proposalId, rawState, stateLabel, eta, canceled, executed, capturedAtBlock, capturedAtTimestamp, reason", async () => {
    const result = await resolveBravoLifecycleEligibility(fakeClient({ state: 5, proposal: proposalTuple({ eta: 500n }), blockTimestamp: 1000n, blockNumber: 12345n }), {
      governor: GOVERNOR,
      proposalId: 1n,
    });
    expect(result.proposalId).toBe("1");
    expect(result.rawState).toBe(5);
    expect(result.stateLabel).toBeTruthy();
    expect(result.eta).toBe("500");
    expect(result.canceled).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.capturedAtBlock).toBe("12345");
    expect(result.capturedAtTimestamp).toBe("1000");
    expect(result.reason).toBeTruthy();
  });
});
