import { encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { KeeperHubLocalRefusalError } from "./errors";
import { buildKeeperHubExecutionRequest, buildKeeperHubSimulationRequest } from "./provider-request-builders";
import type { FrozenContractCall } from "./types";

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
const APPROVE_CALLDATA = encodeFunctionData({
  abi: APPROVE_ABI,
  functionName: "approve",
  args: [SPENDER, 1337n],
});

const CALL: FrozenContractCall = {
  chainId: 11155111,
  contractAddress: "0x0000000000000000000000000000000000000001",
  calldata: APPROVE_CALLDATA,
  value: "0",
  abi: APPROVE_ABI,
};

describe("buildKeeperHubSimulationRequest", () => {
  it("always includes simulate: true in the serialized body", () => {
    const body = buildKeeperHubSimulationRequest(CALL);
    expect(body.simulate).toBe(true);
    expect(JSON.parse(JSON.stringify(body)).simulate).toBe(true);
  });

  it("decodes calldata into functionName + functionArgs — production does not accept raw data (see evidence/keeperhub/contract-call-schema.md)", () => {
    const body = buildKeeperHubSimulationRequest(CALL);
    expect(body.functionName).toBe("approve");
    expect("data" in body).toBe(false);
    expect(JSON.parse(body.functionArgs)).toEqual([SPENDER, "1337"]);
  });

  it("serializes abi as a JSON string", () => {
    const body = buildKeeperHubSimulationRequest(CALL);
    expect(typeof body.abi).toBe("string");
    expect(JSON.parse(body.abi)).toEqual(APPROVE_ABI);
  });

  it("converts value from wei to an ether-denominated decimal string", () => {
    const body = buildKeeperHubSimulationRequest({ ...CALL, value: "1000000000000000000" });
    expect(body.value).toBe("1");
    const fractional = buildKeeperHubSimulationRequest({ ...CALL, value: "100000000000000" });
    expect(fractional.value).toBe("0.0001");
  });

  it("never omits simulate regardless of the input call", () => {
    for (const call of [CALL, { ...CALL, value: "1000000000000000000" }, { ...CALL, chainId: 1 }]) {
      const body = buildKeeperHubSimulationRequest(call);
      expect("simulate" in body).toBe(true);
      expect(body.simulate).toBe(true);
    }
  });

  it("refuses (KEEPERHUB_CALLDATA_UNDECODABLE) rather than guessing when calldata does not match the ABI", () => {
    const mismatched = { ...CALL, calldata: "0xdeadbeef" as const };
    expect(() => buildKeeperHubSimulationRequest(mismatched)).toThrow(KeeperHubLocalRefusalError);
    try {
      buildKeeperHubSimulationRequest(mismatched);
      expect.unreachable();
    } catch (err) {
      expect((err as KeeperHubLocalRefusalError).code).toBe("KEEPERHUB_CALLDATA_UNDECODABLE");
    }
  });
});

describe("buildKeeperHubExecutionRequest", () => {
  it("never includes a simulate key — deliberate, evidence-based omission", () => {
    const body = buildKeeperHubExecutionRequest(CALL);
    expect("simulate" in body).toBe(false);
    const serialized = JSON.parse(JSON.stringify(body));
    expect("simulate" in serialized).toBe(false);
  });

  it("carries chain/target/function/args/value/abi through with the correct wire shape", () => {
    const body = buildKeeperHubExecutionRequest(CALL);
    expect(body).toEqual({
      chainId: CALL.chainId,
      contractAddress: CALL.contractAddress,
      functionName: "approve",
      functionArgs: JSON.stringify([SPENDER, "1337"]),
      abi: JSON.stringify(APPROVE_ABI),
      value: "0",
    });
  });

  it("round-trips: decoded functionName/args re-encode to exactly the original calldata", () => {
    const body = buildKeeperHubExecutionRequest(CALL);
    const reencoded = encodeFunctionData({
      abi: APPROVE_ABI,
      functionName: body.functionName as "approve",
      args: JSON.parse(body.functionArgs),
    });
    expect(reencoded.toLowerCase()).toBe(CALL.calldata.toLowerCase());
  });
});
