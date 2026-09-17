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

/**
 * Gate 12 §CACTUS-LIVE-001 — proposal id losslessness through the ABI-
 * encoding boundary specifically. `encodeActionAuthorization` converts
 * `proposalId` (always a string end-to-end elsewhere) via `BigInt(...)`
 * before ABI-encoding it as `uint256` — this proves that conversion is
 * exact for the full range a real onchain proposal id can take, up to and
 * including 2^256-1, and for the exact real ENS/Optimism ids this gate's
 * live investigation used. See packages/cactus/src/proposal-id-losslessness.test.ts
 * for the same property proven through the Cactus/URL-parsing side of the
 * pipeline.
 */
describe("computeActionAuthorizationHash / encodeActionAuthorization — proposal id losslessness at the ABI-encoding boundary", () => {
  const BOUNDARY_IDS = [
    "0",
    "1",
    "220",
    "9007199254740991", // 2^53 - 1
    "9007199254740992", // 2^53
    "115792089237316195423570985008687907853269984665640564039457584007913129639935", // 2^256 - 1, the true uint256 ceiling
    "19667497139373951686084433718987773325019389190188449031876262520356769920394", // real ENS proposal id
    "47864371633107534187617995773541299064963460661119440983190542488743950169122", // real Optimism proposal id
  ];

  for (const proposalId of BOUNDARY_IDS) {
    it(`encodes and hashes proposal id ${proposalId.length > 20 ? proposalId.slice(0, 12) + "…" : proposalId} without throwing or truncating`, () => {
      const auth: GovernorBravoActionAuthorization = { ...VALID, proposalId };
      expect(() => encodeActionAuthorization(auth)).not.toThrow();
      expect(hash(auth)).toMatch(/^0x[0-9a-f]{64}$/);
    });
  }

  it("every boundary id produces a genuinely distinct hash from every other — no silent collision from truncated encoding", () => {
    const hashes = BOUNDARY_IDS.map((proposalId) => hash({ ...VALID, proposalId }));
    expect(new Set(hashes).size).toBe(BOUNDARY_IDS.length);
  });

  it("2^256 itself (one past the true uint256 ceiling) is rejected by ABI encoding, not silently wrapped", () => {
    const tooLarge: GovernorBravoActionAuthorization = { ...VALID, proposalId: (2n ** 256n).toString() };
    expect(() => encodeActionAuthorization(tooLarge)).toThrow();
  });
});
