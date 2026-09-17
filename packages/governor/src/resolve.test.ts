import { describe, expect, it, vi } from "vitest";
import { GovernorResolutionError } from "./errors";
import { resolveGovernorAuthorization, type GovernorProposalCoordinate } from "./resolve";

const GOVERNOR = "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" as const;
const COORDINATE: GovernorProposalCoordinate = { chainId: 1, governor: GOVERNOR, proposalId: "220" };
const BLOCK = 19393409n;

function mockClient(overrides: {
  getCode?: () => Promise<`0x${string}`>;
  initialProposalIdFails?: boolean;
  stateFails?: boolean;
  actionsFails?: boolean;
} = {}) {
  const readContract = vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "initialProposalId") {
      if (overrides.initialProposalIdFails) throw new Error("function selector not recognized");
      return 1n;
    }
    if (functionName === "getActions") {
      if (overrides.actionsFails) throw new Error("execution reverted");
      return [
        ["0x0000000000000000000000000000000000000001"],
        [0n],
        ["setTargetReserves(address,uint104)"],
        ["0xdeadbeef"],
      ];
    }
    if (functionName === "state") {
      if (overrides.stateFails) throw new Error("GovernorBravo::state: invalid proposal id");
      return 7;
    }
    if (functionName === "proposals") {
      return [220n, "0x0000000000000000000000000000000000000009", 0n, 1n, 2n, 3n, 4n, 5n, false, true];
    }
    throw new Error(`unexpected functionName in test mock: ${functionName}`);
  });

  return {
    getCode: overrides.getCode ?? vi.fn().mockResolvedValue("0x60806040"),
    readContract,
    getBlockNumber: vi.fn().mockResolvedValue(BLOCK),
  } as never;
}

describe("resolveGovernorAuthorization — happy path", () => {
  it("resolves a valid Bravo proposal into a full ResolvedGovernorAuthorization", async () => {
    const result = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    expect(result.authorization.governorFamily).toBe("GOVERNOR_BRAVO");
    expect(result.authorization.actions).toHaveLength(1);
    expect(result.authorization.actions[0]).toEqual({
      actionIndex: 0,
      target: "0x0000000000000000000000000000000000000001",
      value: "0",
      signature: "setTargetReserves(address,uint104)",
      calldata: "0xdeadbeef",
    });
    expect(result.actionAuthorizationHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.lifecycle.state).toBe(7);
    expect(result.lifecycle.eta).toBeNull(); // eta=0 in the mock -> null
    expect(result.resolvedAtBlock).toBe(BLOCK.toString());
  });

  it("evidence records the read methods used and the hash", async () => {
    const result = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    expect(result.evidence.readMethods).toContain("getActions(uint256)");
    expect(result.evidence.actionAuthorizationHash).toBe(result.actionAuthorizationHash);
  });

  it("pins every state-dependent read to the same block returned by getBlockNumber", async () => {
    const client = mockClient();
    await resolveGovernorAuthorization(COORDINATE, { clientOverride: client });
    const readContract = (client as { readContract: ReturnType<typeof vi.fn> }).readContract;
    const stateReads = readContract.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as { functionName: string };
      return ["getActions", "state", "proposals"].includes(arg.functionName);
    });
    expect(stateReads.length).toBeGreaterThan(0);
    for (const call of stateReads) {
      const arg = (call as unknown[])[0] as { blockNumber: bigint };
      expect(arg.blockNumber).toBe(BLOCK);
    }
  });
});

describe("resolveGovernorAuthorization — reproducibility", () => {
  it("produces an identical actionAuthorizationHash across repeated resolutions of the same immutable data", async () => {
    const first = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    const second = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    expect(second.actionAuthorizationHash).toBe(first.actionAuthorizationHash);
  });
});

describe("resolveGovernorAuthorization — lifecycle separation", () => {
  function mockClientWithLifecycle(state: number, eta: bigint, block: bigint) {
    const readContract = vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "initialProposalId") return 1n;
      if (functionName === "getActions") {
        return [
          ["0x0000000000000000000000000000000000000001"],
          [0n],
          ["setTargetReserves(address,uint104)"],
          ["0xdeadbeef"],
        ];
      }
      if (functionName === "state") return state;
      if (functionName === "proposals") return [220n, "0x0000000000000000000000000000000000000009", eta, 1n, 2n, 3n, 4n, 5n, false, state === 7];
      throw new Error(`unexpected: ${functionName}`);
    });
    return { getCode: vi.fn().mockResolvedValue("0x60806040"), readContract, getBlockNumber: vi.fn().mockResolvedValue(block) } as never;
  }

  it("a different state, eta, and capture block produce a DIFFERENT lifecycle but the SAME actionAuthorizationHash", async () => {
    const a = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClientWithLifecycle(5, 1700000000n, 19000000n) });
    const b = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClientWithLifecycle(7, 1707000000n, 19393409n) });

    expect(a.lifecycle.state).not.toBe(b.lifecycle.state);
    expect(a.lifecycle.eta).not.toBe(b.lifecycle.eta);
    expect(a.resolvedAtBlock).not.toBe(b.resolvedAtBlock);

    // The actions are identical in both mocks — only lifecycle fields differ.
    expect(a.actionAuthorizationHash).toBe(b.actionAuthorizationHash);
  });
});

describe("resolveGovernorAuthorization — fails closed", () => {
  it("throws UNSUPPORTED_CHAIN for a chain not in the supported map, without touching any client", async () => {
    await expect(
      resolveGovernorAuthorization({ ...COORDINATE, chainId: 999999 }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
  });

  it("throws GOVERNOR_NOT_FOUND when no contract code exists at the address", async () => {
    await expect(
      resolveGovernorAuthorization(COORDINATE, {
        clientOverride: mockClient({ getCode: vi.fn().mockResolvedValue("0x") }),
      }),
    ).rejects.toMatchObject({ code: "GOVERNOR_NOT_FOUND" });
  });

  it("throws UNSUPPORTED_GOVERNOR_FAMILY when the Bravo probe fails — never guesses from the address", async () => {
    await expect(
      resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient({ initialProposalIdFails: true }) }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_GOVERNOR_FAMILY" });
  });

  it("throws PROPOSAL_NOT_FOUND when state() reverts", async () => {
    await expect(
      resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient({ stateFails: true }) }),
    ).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
  });

  it("throws AUTHORIZATION_READ_FAILED when getActions() reverts", async () => {
    await expect(
      resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient({ actionsFails: true }) }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_READ_FAILED" });
  });

  it("every failure is a GovernorResolutionError with a code, never a bare undefined/null", async () => {
    try {
      await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient({ stateFails: true }) });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GovernorResolutionError);
      expect(typeof (err as GovernorResolutionError).code).toBe("string");
    }
  });
});

describe("resolveGovernorAuthorization — no Cactus authority leak / no execution", () => {
  it("the coordinate input has no organization/title/calldata-shaped fields (Cactus never feeds authoritative data)", () => {
    expect("title" in COORDINATE).toBe(false);
    expect("organization" in COORDINATE).toBe(false);
    expect("authorizedCalldata" in COORDINATE).toBe(false);
  });

  it("resolution never calls a write-shaped method name (execute/queue) on the mocked client", async () => {
    const client = mockClient();
    await resolveGovernorAuthorization(COORDINATE, { clientOverride: client });
    const readContract = (client as { readContract: ReturnType<typeof vi.fn> }).readContract;
    for (const [arg] of readContract.mock.calls) {
      expect(["initialProposalId", "getActions", "state", "proposals"]).toContain((arg as { functionName: string }).functionName);
    }
  });
});
