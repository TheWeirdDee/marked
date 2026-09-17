import { describe, expect, it, vi } from "vitest";
import { readBravoActions, readBravoLifecycle } from "./bravo-adapter";

const GOVERNOR = "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" as const;

describe("readBravoActions", () => {
  it("canonicalizes a valid getActions() response into indexed actions", async () => {
    const readContract = vi.fn().mockResolvedValue([
      ["0x0000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000002"],
      [0n, 0n],
      ["setTargetReserves(address,uint104)", "deployAndUpgradeTo(address,address)"],
      ["0xdeadbeef", "0xcafebabe"],
    ]);
    const actions = await readBravoActions({ readContract } as never, { governor: GOVERNOR, proposalId: 220n });
    expect(actions).toEqual([
      { actionIndex: 0, target: "0x0000000000000000000000000000000000000001", value: "0", signature: "setTargetReserves(address,uint104)", calldata: "0xdeadbeef" },
      { actionIndex: 1, target: "0x0000000000000000000000000000000000000002", value: "0", signature: "deployAndUpgradeTo(address,address)", calldata: "0xcafebabe" },
    ]);
  });

  it("passes the pinned blockNumber through to the RPC call", async () => {
    const readContract = vi.fn().mockResolvedValue([[], [], [], []]);
    await readBravoActions({ readContract } as never, { governor: GOVERNOR, proposalId: 220n, blockNumber: 19393409n });
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 19393409n }));
  });

  it("throws AUTHORIZATION_READ_FAILED when the RPC call reverts", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("execution reverted"));
    await expect(
      readBravoActions({ readContract } as never, { governor: GOVERNOR, proposalId: 220n }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_READ_FAILED" });
  });

  it("throws RPC_INCONSISTENT_READ when the returned arrays have mismatched lengths", async () => {
    const readContract = vi.fn().mockResolvedValue([["0x0000000000000000000000000000000000000001"], [0n, 1n], ["sig"], ["0x00"]]);
    await expect(
      readBravoActions({ readContract } as never, { governor: GOVERNOR, proposalId: 220n }),
    ).rejects.toMatchObject({ code: "RPC_INCONSISTENT_READ" });
  });
});

describe("readBravoLifecycle", () => {
  it("reads state + proposals() and reports eta/canceled/executed", async () => {
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(7) // state()
      .mockResolvedValueOnce([220n, "0x0000000000000000000000000000000000000009", 1707000000n, 1n, 2n, 3n, 4n, 5n, false, true]); // proposals()
    const result = await readBravoLifecycle({ readContract } as never, { governor: GOVERNOR, proposalId: 220n });
    expect(result).toEqual({ state: 7, eta: 1707000000n, canceled: false, executed: true, onchainId: 220n });
  });

  it("throws PROPOSAL_NOT_FOUND when state() reverts (invalid proposal id)", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("GovernorBravo::state: invalid proposal id"));
    await expect(
      readBravoLifecycle({ readContract } as never, { governor: GOVERNOR, proposalId: 999999999n }),
    ).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
  });

  it("throws RPC_INCONSISTENT_READ when proposals() self-reports a different id than requested", async () => {
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce([221n, "0x0000000000000000000000000000000000000009", 0n, 1n, 2n, 3n, 4n, 5n, false, true]);
    await expect(
      readBravoLifecycle({ readContract } as never, { governor: GOVERNOR, proposalId: 220n }),
    ).rejects.toMatchObject({ code: "RPC_INCONSISTENT_READ" });
  });

  it("passes the pinned blockNumber through to both reads", async () => {
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce([220n, "0x0000000000000000000000000000000000000009", 0n, 1n, 2n, 3n, 4n, 5n, false, true]);
    await readBravoLifecycle({ readContract } as never, { governor: GOVERNOR, proposalId: 220n, blockNumber: 19393409n });
    for (const call of readContract.mock.calls) {
      expect(call[0]).toMatchObject({ blockNumber: 19393409n });
    }
  });
});
