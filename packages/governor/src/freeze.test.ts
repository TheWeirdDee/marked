import { describe, expect, it, vi } from "vitest";
import { freezeAuthorization, recheckAuthorization } from "./freeze";
import { resolveGovernorAuthorization, type GovernorProposalCoordinate } from "./resolve";

const GOVERNOR = "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" as const;
const COORDINATE: GovernorProposalCoordinate = { chainId: 1, governor: GOVERNOR, proposalId: "220" };

function mockClient(signature = "setTargetReserves(address,uint104)") {
  const readContract = vi.fn().mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "initialProposalId") return 1n;
    if (functionName === "getActions") {
      return [["0x0000000000000000000000000000000000000001"], [0n], [signature], ["0xdeadbeef"]];
    }
    if (functionName === "state") return 7;
    if (functionName === "proposals") return [220n, "0x0000000000000000000000000000000000000009", 0n, 1n, 2n, 3n, 4n, 5n, false, true];
    throw new Error(`unexpected: ${functionName}`);
  });
  return { getCode: vi.fn().mockResolvedValue("0x60806040"), readContract, getBlockNumber: vi.fn().mockResolvedValue(19393409n) } as never;
}

describe("freezeAuthorization", () => {
  it("preserves the authorization and hash exactly", async () => {
    const resolved = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    const frozen = freezeAuthorization(resolved);
    expect(frozen.authorization).toEqual(resolved.authorization);
    expect(frozen.actionAuthorizationHash).toBe(resolved.actionAuthorizationHash);
    expect(frozen.frozenAtBlock).toBe(resolved.resolvedAtBlock);
  });

  it("is deeply frozen — mutating an action after freezing throws in strict mode", async () => {
    const resolved = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    const frozen = freezeAuthorization(resolved);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.authorization)).toBe(true);
    expect(Object.isFrozen(frozen.authorization.actions)).toBe(true);
    expect(Object.isFrozen(frozen.authorization.actions[0])).toBe(true);
    expect(() => {
      // @ts-expect-error deliberate mutation attempt for the test
      frozen.authorization.actions[0].target = "0x0000000000000000000000000000000000000099";
    }).toThrow(TypeError);
  });
});

describe("recheckAuthorization", () => {
  it("reports matches:true when current onchain authorization is unchanged", async () => {
    const resolved = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    const frozen = freezeAuthorization(resolved);
    const recheck = await recheckAuthorization(frozen, COORDINATE, { clientOverride: mockClient() });
    expect(recheck).toEqual({ matches: true, frozenHash: frozen.actionAuthorizationHash, currentHash: frozen.actionAuthorizationHash });
  });

  it("reports matches:false with ACTION_AUTHORIZATION_MISMATCH when current authorization differs", async () => {
    const resolved = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    const frozen = freezeAuthorization(resolved);
    const recheck = await recheckAuthorization(frozen, COORDINATE, { clientOverride: mockClient("aDifferentFunction()") });
    expect(recheck.matches).toBe(false);
    if (!recheck.matches) {
      expect(recheck.reason).toBe("ACTION_AUTHORIZATION_MISMATCH");
      expect(recheck.currentHash).not.toBe(recheck.frozenHash);
    }
  });

  it("recheck performs no write — only resolveGovernorAuthorization's read-only client methods are exercised", async () => {
    const resolved = await resolveGovernorAuthorization(COORDINATE, { clientOverride: mockClient() });
    const frozen = freezeAuthorization(resolved);
    const client = mockClient();
    await recheckAuthorization(frozen, COORDINATE, { clientOverride: client });
    const readContract = (client as { readContract: ReturnType<typeof vi.fn> }).readContract;
    for (const [arg] of readContract.mock.calls) {
      expect(["initialProposalId", "getActions", "state", "proposals"]).toContain((arg as { functionName: string }).functionName);
    }
  });
});
