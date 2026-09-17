import { describe, expect, it, vi } from "vitest";
import { verifyGovernorProposalExists } from "./verify-existence";

const GOVERNOR = "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" as const;

function mockClient(overrides: { getCode?: () => Promise<`0x${string}` | undefined>; readContract?: () => Promise<unknown> }) {
  return {
    getCode: overrides.getCode ?? vi.fn().mockResolvedValue("0x60806040"),
    readContract: overrides.readContract ?? vi.fn().mockResolvedValue(7),
  } as never;
}

describe("verifyGovernorProposalExists", () => {
  it("reports ok:true with the observed state when code exists and state() reads cleanly", async () => {
    const result = await verifyGovernorProposalExists({
      chainId: 1,
      governor: GOVERNOR,
      proposalId: "220",
      clientOverride: mockClient({ readContract: vi.fn().mockResolvedValue(7) }),
    });
    expect(result).toEqual({ ok: true, hasCode: true, stateReadable: true, state: 7 });
  });

  it("fails closed when no contract code exists at the governor address (wrong Governor)", async () => {
    const result = await verifyGovernorProposalExists({
      chainId: 1,
      governor: GOVERNOR,
      proposalId: "220",
      clientOverride: mockClient({ getCode: vi.fn().mockResolvedValue("0x") }),
    });
    expect(result.ok).toBe(false);
    expect(result.hasCode).toBe(false);
  });

  it("fails closed when the proposal id cannot be read (missing/nonexistent proposal)", async () => {
    const result = await verifyGovernorProposalExists({
      chainId: 1,
      governor: GOVERNOR,
      proposalId: "999999999",
      clientOverride: mockClient({ readContract: vi.fn().mockRejectedValue(new Error("execution reverted")) }),
    });
    expect(result.ok).toBe(false);
    expect(result.hasCode).toBe(true);
    expect(result.stateReadable).toBe(false);
  });

  it("rejects an unsupported chainId before attempting any RPC call", async () => {
    const getCode = vi.fn();
    const readContract = vi.fn();
    const result = await verifyGovernorProposalExists({
      chainId: 999999,
      governor: GOVERNOR,
      proposalId: "1",
    });
    expect(result.ok).toBe(false);
    expect(getCode).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalled();
  });

  it("does not extract or return any action bundle (targets/values/calldatas) — existence only", async () => {
    const result = await verifyGovernorProposalExists({
      chainId: 1,
      governor: GOVERNOR,
      proposalId: "220",
      clientOverride: mockClient({}),
    });
    expect("targets" in result).toBe(false);
    expect("calldatas" in result).toBe(false);
    expect("values" in result).toBe(false);
  });
});
