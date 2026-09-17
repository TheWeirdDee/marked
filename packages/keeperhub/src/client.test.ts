import { encodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";
import { executeContractCall, simulateContractCall } from "./client";
import { KeeperHubLocalRefusalError, KeeperHubProviderError } from "./errors";
import { hashContractCall } from "./request-hash";
import type { ExplicitExecutionAuthorization, FrozenContractCall, KeeperHubClientConfig } from "./types";

const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const SPENDER = "0x000000000000000000000000000000000000dEaD";
const APPROVE_CALLDATA = encodeFunctionData({ abi: APPROVE_ABI, functionName: "approve", args: [SPENDER, 1337n] });

const CALL: FrozenContractCall = {
  chainId: 11155111,
  contractAddress: "0x0000000000000000000000000000000000000001",
  calldata: APPROVE_CALLDATA,
  value: "0",
  abi: APPROVE_ABI,
};

function authFor(call: FrozenContractCall): ExplicitExecutionAuthorization {
  return { intent: "EXECUTE", requestHash: hashContractCall(call) };
}

function mockFetchJson(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function configWith(fetchImpl: ReturnType<typeof vi.fn>, overrides: Partial<KeeperHubClientConfig> = {}): KeeperHubClientConfig {
  return { apiKey: "kh_test_key", enableMainnetWrite: false, fetchImpl: fetchImpl as unknown as typeof fetch, ...overrides };
}

describe("simulateContractCall", () => {
  it("sends simulate: true and the correct wire fields, and parses a successful simulation", async () => {
    const fetchImpl = mockFetchJson(200, { success: true, wouldRevert: false, gasEstimate: "21000" });
    const result = await simulateContractCall(CALL, configWith(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.simulate).toBe(true);
    expect(sentBody.functionName).toBe("approve");
    expect(JSON.parse(sentBody.functionArgs)).toEqual([SPENDER, "1337"]);
    expect(result.wouldRevert).toBe(false);
    expect(result.gasEstimate).toBe("21000");
  });

  it("does not send an Idempotency-Key header — simulation never reserves", async () => {
    const fetchImpl = mockFetchJson(200, { success: true, wouldRevert: false });
    await simulateContractCall(CALL, configWith(fetchImpl));
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });

  it("throws KeeperHubProviderError and makes zero further calls when wouldRevert is true", async () => {
    const fetchImpl = mockFetchJson(200, { success: false, wouldRevert: true });
    await expect(simulateContractCall(CALL, configWith(fetchImpl))).rejects.toBeInstanceOf(KeeperHubProviderError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("makes ZERO fetch calls when the call is malformed (local refusal)", async () => {
    const fetchImpl = vi.fn();
    const malformed = { ...CALL, calldata: "" as never };
    await expect(simulateContractCall(malformed, configWith(fetchImpl))).rejects.toBeInstanceOf(KeeperHubLocalRefusalError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes ZERO fetch calls when the ABI is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(simulateContractCall({ ...CALL, abi: [] }, configWith(fetchImpl))).rejects.toBeInstanceOf(
      KeeperHubLocalRefusalError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes ZERO fetch calls when calldata cannot be decoded against the ABI", async () => {
    const fetchImpl = vi.fn();
    const mismatched = { ...CALL, calldata: "0xdeadbeef" as const };
    await expect(simulateContractCall(mismatched, configWith(fetchImpl))).rejects.toMatchObject({
      code: "KEEPERHUB_CALLDATA_UNDECODABLE",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("has no parameter through which an execution authorization could be supplied (type-level: see the function signature in client.ts, which takes only a call and a config)", () => {
    expect(simulateContractCall.length).toBe(2);
  });
});

describe("executeContractCall", () => {
  it("makes ZERO fetch calls when authorization is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(
      executeContractCall(CALL, undefined as unknown as ExplicitExecutionAuthorization, configWith(fetchImpl)),
    ).rejects.toBeInstanceOf(KeeperHubLocalRefusalError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes ZERO fetch calls when the request hash does not match the call", async () => {
    const fetchImpl = vi.fn();
    const otherCalldata = encodeFunctionData({ abi: APPROVE_ABI, functionName: "approve", args: [SPENDER, 1n] });
    const wrongAuth = authFor({ ...CALL, calldata: otherCalldata });
    await expect(executeContractCall(CALL, wrongAuth, configWith(fetchImpl))).rejects.toBeInstanceOf(
      KeeperHubLocalRefusalError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes ZERO fetch calls for a mainnet call when ENABLE_MAINNET_WRITE is false, even with valid matching authorization", async () => {
    const fetchImpl = vi.fn();
    const mainnetCall: FrozenContractCall = { ...CALL, chainId: 1 };
    await expect(
      executeContractCall(mainnetCall, authFor(mainnetCall), configWith(fetchImpl, { enableMainnetWrite: false })),
    ).rejects.toMatchObject({ code: "KEEPERHUB_MAINNET_WRITE_DISABLED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes ZERO fetch calls for a malformed call even with an authorization present", async () => {
    const fetchImpl = vi.fn();
    const malformed = { ...CALL, contractAddress: "not-an-address" as never };
    await expect(executeContractCall(malformed, authFor(CALL), configWith(fetchImpl))).rejects.toBeInstanceOf(
      KeeperHubLocalRefusalError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes ZERO fetch calls when the ABI is missing, even with a valid authorization for the (invalid) call", async () => {
    const fetchImpl = vi.fn();
    const noAbi = { ...CALL, abi: [] };
    await expect(executeContractCall(noAbi, authFor(noAbi), configWith(fetchImpl))).rejects.toMatchObject({
      code: "KEEPERHUB_ABI_MISSING",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends a request with NO simulate key, an Idempotency-Key header, and the correct wire shape when authorization is valid", async () => {
    const fetchImpl = mockFetchJson(200, { executionId: "exec_1", status: "completed", transactionHash: "0xabc" });
    const result = await executeContractCall(CALL, authFor(CALL), configWith(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect("simulate" in sentBody).toBe(false);
    expect(sentBody.functionName).toBe("approve");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(hashContractCall(CALL));
    expect(result.executionId).toBe("exec_1");
    expect(result.transactionHash).toBe("0xabc");
  });

  it("permits mainnet execution only when ENABLE_MAINNET_WRITE is explicitly true", async () => {
    const fetchImpl = mockFetchJson(200, { executionId: "exec_2", status: "completed" });
    const mainnetCall: FrozenContractCall = { ...CALL, chainId: 1 };
    const result = await executeContractCall(
      mainnetCall,
      authFor(mainnetCall),
      configWith(fetchImpl, { enableMainnetWrite: true }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.executionId).toBe("exec_2");
  });
});

describe("simulation cannot become execution", () => {
  it("simulateContractCall's request body always carries simulate:true even for a call that would also be valid for execution", async () => {
    const fetchImpl = mockFetchJson(200, { success: true, wouldRevert: false });
    await simulateContractCall(CALL, configWith(fetchImpl));
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    // The one property that distinguishes a simulation wire request from an
    // execution one is this flag. Asserting its presence here, alongside
    // provider-request-builders.test.ts asserting its absence on the
    // execution path, is the regression test for incident 001: there is no
    // way to reach the provider without this flag being deliberately set
    // one way or the other.
    expect(sentBody.simulate).toBe(true);
  });
});
