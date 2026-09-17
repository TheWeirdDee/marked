import { describe, expect, it } from "vitest";
import {
  computeActionAuthorizationHash,
  encodeActionAuthorization,
  UnsupportedGovernorFamilyError,
  type GovernorBravoActionAuthorization,
} from "./hash-domains";

const VALID: GovernorBravoActionAuthorization = {
  version: 1,
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "220",
  actions: [
    {
      actionIndex: 0,
      target: "0x0000000000000000000000000000000000000001",
      value: "0",
      signature: "setTargetReserves(address,uint104)",
      calldata: "0xdeadbeef",
    },
    {
      actionIndex: 1,
      target: "0x0000000000000000000000000000000000000002",
      value: "0",
      signature: "deployAndUpgradeTo(address,address)",
      calldata: "0xcafebabe",
    },
  ],
};

function hash(auth: GovernorBravoActionAuthorization): string {
  return computeActionAuthorizationHash(auth);
}

describe("computeActionAuthorizationHash — determinism", () => {
  it("produces the same hash for structurally identical input", () => {
    const copy: GovernorBravoActionAuthorization = JSON.parse(JSON.stringify(VALID));
    expect(hash(copy)).toBe(hash(VALID));
  });

  it("produces the same hash across repeated calls (no hidden nondeterminism)", () => {
    expect(hash(VALID)).toBe(hash(VALID));
  });

  it("is a 32-byte (0x + 64 hex char) keccak256 hash", () => {
    expect(hash(VALID)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("computeActionAuthorizationHash — mutation sensitivity (authorization-relevant fields)", () => {
  const base = hash(VALID);

  it("changes when chainId changes", () => {
    expect(hash({ ...VALID, chainId: 2 })).not.toBe(base);
  });

  it("changes on a governor address mutation", () => {
    expect(hash({ ...VALID, governor: "0x0000000000000000000000000000000000000099" })).not.toBe(base);
  });

  it("changes when proposalId changes", () => {
    expect(hash({ ...VALID, proposalId: "221" })).not.toBe(base);
  });

  it("changes when action order is swapped, even with the same actions present", () => {
    const swapped = { ...VALID, actions: [VALID.actions[1]!, VALID.actions[0]!] };
    expect(hash(swapped)).not.toBe(base);
  });

  it("changes on a target mutation", () => {
    const mutated = {
      ...VALID,
      actions: [{ ...VALID.actions[0]!, target: "0x0000000000000000000000000000000000000099" as const }, VALID.actions[1]!],
    };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes on a value mutation", () => {
    const mutated = { ...VALID, actions: [{ ...VALID.actions[0]!, value: "1" }, VALID.actions[1]!] };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes on a signature mutation", () => {
    const mutated = { ...VALID, actions: [{ ...VALID.actions[0]!, signature: "somethingElse()" }, VALID.actions[1]!] };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes on a one-byte calldata mutation", () => {
    const mutated = { ...VALID, actions: [{ ...VALID.actions[0]!, calldata: "0xdeadbeee" as const }, VALID.actions[1]!] };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes when an action is added", () => {
    const added = {
      ...VALID,
      actions: [...VALID.actions, { actionIndex: 2, target: "0x0000000000000000000000000000000000000003" as const, value: "0", signature: "", calldata: "0x00000001" as const }],
    };
    expect(hash(added)).not.toBe(base);
  });

  it("changes when an action is removed", () => {
    const removed = { ...VALID, actions: [VALID.actions[0]!] };
    expect(hash(removed)).not.toBe(base);
  });

  it("changes when actionIndex itself is mutated (even if position in the array is unchanged)", () => {
    const mutated = { ...VALID, actions: [{ ...VALID.actions[0]!, actionIndex: 99 }, VALID.actions[1]!] };
    expect(hash(mutated)).not.toBe(base);
  });
});

describe("computeActionAuthorizationHash — unsupported family fails closed", () => {
  it("throws UnsupportedGovernorFamilyError rather than guessing an encoding", () => {
    const ozLike = { ...VALID, governorFamily: "OPENZEPPELIN_GOVERNOR" } as unknown as GovernorBravoActionAuthorization;
    expect(() => computeActionAuthorizationHash(ozLike)).toThrow(UnsupportedGovernorFamilyError);
  });
});

describe("encodeActionAuthorization — canonical bytes, not JSON", () => {
  it("is not merely JSON.stringify (order of ABI-encoded bytes is not affected by JS key order)", () => {
    const reordered = {
      proposalId: VALID.proposalId,
      actions: VALID.actions,
      governor: VALID.governor,
      chainId: VALID.chainId,
      governorFamily: VALID.governorFamily,
      version: VALID.version,
    } as GovernorBravoActionAuthorization;
    expect(encodeActionAuthorization(reordered)).toBe(encodeActionAuthorization(VALID));
  });

  it("round-trips deterministically: identical logical input produces identical bytes every time", () => {
    expect(encodeActionAuthorization(VALID)).toBe(encodeActionAuthorization(VALID));
  });

  it("hash is exactly keccak256 of the canonical encoding — independently recomputable", async () => {
    const { keccak256 } = await import("viem");
    expect(computeActionAuthorizationHash(VALID)).toBe(keccak256(encodeActionAuthorization(VALID)));
  });
});
