import { describe, expect, it } from "vitest";
import {
  assertLocalPreconditionsForExecution,
  assertLocalPreconditionsForSimulation,
} from "./local-validation";
import { KeeperHubLocalRefusalError } from "./errors";
import { hashContractCall } from "./request-hash";
import type { ExplicitExecutionAuthorization, FrozenContractCall } from "./types";

const VALID_SEPOLIA_CALL: FrozenContractCall = {
  chainId: 11155111,
  contractAddress: "0x0000000000000000000000000000000000000001",
  calldata: "0xdeadbeef",
  value: "0",
  abi: [{ type: "function", name: "ping", inputs: [], outputs: [], stateMutability: "nonpayable" }],
};

function authFor(call: FrozenContractCall): ExplicitExecutionAuthorization {
  return { intent: "EXECUTE", requestHash: hashContractCall(call) };
}

describe("assertLocalPreconditionsForSimulation", () => {
  it("passes for a well-formed Sepolia call", () => {
    expect(() => assertLocalPreconditionsForSimulation(VALID_SEPOLIA_CALL)).not.toThrow();
  });

  it("passes for a well-formed mainnet call (simulation never needs the mainnet guard)", () => {
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, chainId: 1 })).not.toThrow();
  });

  it("rejects an unsupported chain", () => {
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, chainId: 999999 })).toThrow(
      KeeperHubLocalRefusalError,
    );
  });

  it("rejects a missing contractAddress", () => {
    expect(() =>
      assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, contractAddress: "" as never }),
    ).toThrow(KeeperHubLocalRefusalError);
  });

  it("rejects a malformed contractAddress", () => {
    expect(() =>
      assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, contractAddress: "not-an-address" as never }),
    ).toThrow(KeeperHubLocalRefusalError);
  });

  it("rejects missing calldata", () => {
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, calldata: "" as never })).toThrow(
      KeeperHubLocalRefusalError,
    );
  });

  it("rejects malformed (non-hex, odd-length) calldata", () => {
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, calldata: "0xzz" as never })).toThrow(
      KeeperHubLocalRefusalError,
    );
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, calldata: "0xabc" as never })).toThrow(
      KeeperHubLocalRefusalError,
    );
  });

  it("rejects calldata shorter than a full 4-byte selector (KeeperHub's selectorOf requirement)", () => {
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, calldata: "0xaabbcc" as never })).toThrow(
      KeeperHubLocalRefusalError,
    );
  });

  it("rejects missing/non-numeric value", () => {
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, value: undefined as never })).toThrow(
      KeeperHubLocalRefusalError,
    );
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, value: "not-a-number" })).toThrow(
      KeeperHubLocalRefusalError,
    );
  });

  it("rejects a missing or empty ABI — Marked never depends on KeeperHub's explorer auto-fetch", () => {
    try {
      assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, abi: undefined as never });
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_ABI_MISSING");
    }
    expect(() => assertLocalPreconditionsForSimulation({ ...VALID_SEPOLIA_CALL, abi: [] })).toThrow(
      KeeperHubLocalRefusalError,
    );
  });
});

describe("assertLocalPreconditionsForExecution", () => {
  it("passes for a well-formed Sepolia call with matching authorization", () => {
    expect(() =>
      assertLocalPreconditionsForExecution(VALID_SEPOLIA_CALL, authFor(VALID_SEPOLIA_CALL), {
        enableMainnetWrite: false,
      }),
    ).not.toThrow();
  });

  it("rejects execution with no authorization at all", () => {
    try {
      assertLocalPreconditionsForExecution(VALID_SEPOLIA_CALL, undefined, { enableMainnetWrite: false });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(KeeperHubLocalRefusalError);
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_EXECUTION_AUTHORIZATION_MISSING");
    }
  });

  it("rejects an authorization whose intent is not EXECUTE", () => {
    const badAuth = { intent: "SIMULATE", requestHash: hashContractCall(VALID_SEPOLIA_CALL) } as unknown as ExplicitExecutionAuthorization;
    try {
      assertLocalPreconditionsForExecution(VALID_SEPOLIA_CALL, badAuth, { enableMainnetWrite: false });
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_EXECUTION_INTENT_INVALID");
    }
  });

  it("rejects a request-hash mismatch (authorization for a different call)", () => {
    const otherCall: FrozenContractCall = { ...VALID_SEPOLIA_CALL, calldata: "0x00000001" };
    try {
      assertLocalPreconditionsForExecution(VALID_SEPOLIA_CALL, authFor(otherCall), { enableMainnetWrite: false });
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_REQUEST_HASH_MISMATCH");
    }
  });

  it("rejects a mainnet call when ENABLE_MAINNET_WRITE is false, even with a fully valid, matching authorization", () => {
    const mainnetCall: FrozenContractCall = { ...VALID_SEPOLIA_CALL, chainId: 1 };
    try {
      assertLocalPreconditionsForExecution(mainnetCall, authFor(mainnetCall), { enableMainnetWrite: false });
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_MAINNET_WRITE_DISABLED");
    }
  });

  it("allows a mainnet call only when ENABLE_MAINNET_WRITE is explicitly true", () => {
    const mainnetCall: FrozenContractCall = { ...VALID_SEPOLIA_CALL, chainId: 1 };
    expect(() =>
      assertLocalPreconditionsForExecution(mainnetCall, authFor(mainnetCall), { enableMainnetWrite: true }),
    ).not.toThrow();
  });

  it("rejects malformed calls the same way simulation does, before checking authorization", () => {
    const malformed = { ...VALID_SEPOLIA_CALL, calldata: "" as never };
    try {
      assertLocalPreconditionsForExecution(malformed, authFor(VALID_SEPOLIA_CALL), { enableMainnetWrite: false });
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_CALLDATA_MISSING");
    }
  });

  it("rejects a missing ABI even with a matching authorization", () => {
    const noAbi = { ...VALID_SEPOLIA_CALL, abi: [] };
    try {
      assertLocalPreconditionsForExecution(noAbi, authFor(VALID_SEPOLIA_CALL), { enableMainnetWrite: false });
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_ABI_MISSING");
    }
  });
});
