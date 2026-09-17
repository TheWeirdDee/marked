import { describe, expect, it } from "vitest";
import {
  computeFulfillmentCommitmentHash,
  computePostconditionBindingHash,
  encodeFulfillmentCommitment,
  type FulfillmentCommitment,
  type PostconditionBinding,
} from "./fulfillment-commitment";

const BINDING: PostconditionBinding = {
  actionIndex: 0,
  adapterId: "erc20-transfer",
  adapterVersion: "1",
  required: true,
  bindingParams: [
    { key: "token", value: "0x0000000000000000000000000000000000000001" },
    { key: "recipient", value: "0x0000000000000000000000000000000000000002" },
    { key: "rawAmount", value: "60000000000" },
  ],
};

const VALID: FulfillmentCommitment = {
  version: 1,
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  governorFamily: "GOVERNOR_BRAVO",
  proposalId: "220",
  frozenActionAuthorizationHash: "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
  selectedActionIndexes: [0],
  postconditionBindings: [BINDING],
  fulfillmentMode: "APPROVE",
  executionSurfaceId: "keeperhub-direct-contract-call-v1",
  executionPolicyVersion: "1",
};

function hash(c: FulfillmentCommitment): string {
  return computeFulfillmentCommitmentHash(c);
}

describe("computeFulfillmentCommitmentHash — determinism", () => {
  it("is deterministic across repeated calls", () => {
    expect(hash(VALID)).toBe(hash(VALID));
  });

  it("is deterministic across a deep-cloned structurally-identical object", () => {
    const copy: FulfillmentCommitment = JSON.parse(JSON.stringify(VALID));
    expect(hash(copy)).toBe(hash(VALID));
  });

  it("is unaffected by JS object key order", () => {
    const reordered = {
      fulfillmentMode: VALID.fulfillmentMode,
      postconditionBindings: VALID.postconditionBindings,
      selectedActionIndexes: VALID.selectedActionIndexes,
      frozenActionAuthorizationHash: VALID.frozenActionAuthorizationHash,
      proposalId: VALID.proposalId,
      governorFamily: VALID.governorFamily,
      governor: VALID.governor,
      chainId: VALID.chainId,
      executionSurfaceId: VALID.executionSurfaceId,
      executionPolicyVersion: VALID.executionPolicyVersion,
      version: VALID.version,
    } as FulfillmentCommitment;
    expect(hash(reordered)).toBe(hash(VALID));
  });

  it("is a 32-byte keccak256 hash", () => {
    expect(hash(VALID)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is exactly keccak256 of the canonical encoding", async () => {
    const { keccak256 } = await import("viem");
    expect(hash(VALID)).toBe(keccak256(encodeFulfillmentCommitment(VALID)));
  });
});

describe("computeFulfillmentCommitmentHash — mutation sensitivity", () => {
  const base = hash(VALID);

  it("changes when chainId changes", () => {
    expect(hash({ ...VALID, chainId: 2 })).not.toBe(base);
  });

  it("changes when governor changes", () => {
    expect(hash({ ...VALID, governor: "0x0000000000000000000000000000000000000099" })).not.toBe(base);
  });

  it("changes when proposalId changes", () => {
    expect(hash({ ...VALID, proposalId: "221" })).not.toBe(base);
  });

  it("changes when frozenActionAuthorizationHash changes", () => {
    expect(hash({ ...VALID, frozenActionAuthorizationHash: "0x0000000000000000000000000000000000000000000000000000000000000001" })).not.toBe(base);
  });

  it("changes when selectedActionIndexes content changes", () => {
    expect(hash({ ...VALID, selectedActionIndexes: [1] })).not.toBe(base);
  });

  it("changes when selectedActionIndexes order changes (multi-index case)", () => {
    const withTwo = { ...VALID, selectedActionIndexes: [0, 1] };
    const reordered = { ...VALID, selectedActionIndexes: [1, 0] };
    expect(hash(withTwo)).not.toBe(hash(reordered));
  });

  it("changes when a postcondition binding's adapterVersion changes", () => {
    const mutated = { ...VALID, postconditionBindings: [{ ...BINDING, adapterVersion: "2" }] };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes when a postcondition binding's bindingParams token value changes (Gate 4 instructions §12 test 9)", () => {
    const mutated = {
      ...VALID,
      postconditionBindings: [{ ...BINDING, bindingParams: [{ key: "token", value: "0x0000000000000000000000000000000000000099" }, ...BINDING.bindingParams.slice(1)] }],
    };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes when a postcondition binding's bindingParams recipient value changes (§12 test 10)", () => {
    const mutated = {
      ...VALID,
      postconditionBindings: [
        { ...BINDING, bindingParams: [BINDING.bindingParams[0]!, { key: "recipient", value: "0x0000000000000000000000000000000000000099" }, BINDING.bindingParams[2]!] },
      ],
    };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes when a postcondition binding's rawAmount changes by exactly 1 (§12 test 11)", () => {
    const mutated = {
      ...VALID,
      postconditionBindings: [{ ...BINDING, bindingParams: [BINDING.bindingParams[0]!, BINDING.bindingParams[1]!, { key: "rawAmount", value: "60000000001" }] }],
    };
    expect(hash(mutated)).not.toBe(base);
  });

  it("changes when fulfillmentMode changes (APPROVE vs AUTO) — §12 test 12", () => {
    expect(hash({ ...VALID, fulfillmentMode: "AUTO" })).not.toBe(base);
  });

  it("changes when executionSurfaceId changes", () => {
    expect(hash({ ...VALID, executionSurfaceId: "keeperhub-workflow-v1" })).not.toBe(base);
  });

  it("changes when executionPolicyVersion changes", () => {
    expect(hash({ ...VALID, executionPolicyVersion: "2" })).not.toBe(base);
  });
});

describe("cannot collide with the Gate 2 action-authorization hash domain", () => {
  it("uses a distinct domain string from MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1", async () => {
    const { FULFILLMENT_COMMITMENT_DOMAIN, POSTCONDITION_BINDING_DOMAIN } = await import("./fulfillment-commitment");
    const { GOVERNOR_ACTION_AUTHORIZATION_DOMAIN } = await import("./hash-domains");
    expect(FULFILLMENT_COMMITMENT_DOMAIN).not.toBe(GOVERNOR_ACTION_AUTHORIZATION_DOMAIN);
    expect(POSTCONDITION_BINDING_DOMAIN).not.toBe(GOVERNOR_ACTION_AUTHORIZATION_DOMAIN);
    expect(FULFILLMENT_COMMITMENT_DOMAIN).not.toBe(POSTCONDITION_BINDING_DOMAIN);
  });
});

describe("computePostconditionBindingHash — mutation sensitivity (the sub-hash embedded in the top-level commitment)", () => {
  const base = computePostconditionBindingHash(BINDING);

  it("changes when actionIndex changes", () => {
    expect(computePostconditionBindingHash({ ...BINDING, actionIndex: 1 })).not.toBe(base);
  });

  it("changes when adapterId changes", () => {
    expect(computePostconditionBindingHash({ ...BINDING, adapterId: "other-adapter" })).not.toBe(base);
  });

  it("changes when required changes", () => {
    expect(computePostconditionBindingHash({ ...BINDING, required: false })).not.toBe(base);
  });

  it("changes when bindingParams order changes", () => {
    const reordered = { ...BINDING, bindingParams: [BINDING.bindingParams[2]!, BINDING.bindingParams[1]!, BINDING.bindingParams[0]!] };
    expect(computePostconditionBindingHash(reordered)).not.toBe(base);
  });

  it("is deterministic across repeated calls", () => {
    expect(computePostconditionBindingHash(BINDING)).toBe(base);
  });
});
