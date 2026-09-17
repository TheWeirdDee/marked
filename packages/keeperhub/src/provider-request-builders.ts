import { decodeFunctionData, encodeFunctionData, type Abi } from "viem";
import { KeeperHubLocalRefusalError } from "./errors";
import type { FrozenContractCall } from "./types";
import { weiDecimalStringToEtherDecimalString } from "./units";

/**
 * Wire shape for `POST /api/execute/contract-call`, taken from KeeperHub's
 * actual source and live-verified against production (see
 * evidence/keeperhub/contract-call-schema.md):
 *
 *   - `functionName` + `functionArgs` (JSON-stringified array), NOT raw
 *     `data` — KeeperHub's raw-calldata (`data`) support (PR #2449) is
 *     merged to staging only; production still returned
 *     `{"error":"Missing required field","field":"functionName"}` when
 *     this package's live-verified check sent `data` alone. So this
 *     serializer decodes Marked's own frozen `calldata` locally (using
 *     `abi`, which this package already requires) into functionName+args,
 *     then round-trip-verifies by re-encoding before ever building a wire
 *     request — Marked interprets its own calldata; KeeperHub is never
 *     asked to.
 *   - `abi` is a JSON-stringified ABI array.
 *   - `value` is an ether-denominated decimal string (confirmed via
 *     `parseNativeValueEther` in KeeperHub's route source), converted
 *     from Marked's internal wei representation.
 */
type KeeperHubContractCallWireFields = {
  chainId: number;
  contractAddress: string;
  functionName: string;
  functionArgs: string;
  abi: string;
  value: string;
};

export type KeeperHubSimulationRequestBody = KeeperHubContractCallWireFields & {
  simulate: true;
};

/**
 * `simulate` is deliberately absent — see incident 001
 * (evidence/keeperhub/incidents/001-omitted-simulate-executed.md).
 * KeeperHub's own route treats an absent `simulate` as "execute." This
 * omission is the one place in this codebase it is allowed, because it is
 * exactly what is being asserted by test, not silently relied upon.
 */
export type KeeperHubExecutionRequestBody = KeeperHubContractCallWireFields;

/** Recursively converts bigint values (as decoded by viem) into strings so the result is JSON-safe. */
function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}

function decodeAndVerify(call: FrozenContractCall): { functionName: string; args: unknown[] } {
  const abi = call.abi as Abi;
  let decoded: { functionName: string; args?: readonly unknown[] | undefined };
  try {
    decoded = decodeFunctionData({ abi, data: call.calldata });
  } catch (cause) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_CALLDATA_UNDECODABLE",
      `calldata ${call.calldata} could not be decoded against the provided abi: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
  const args = [...(decoded.args ?? [])];

  // Round-trip verify: re-encoding the decoded call must reproduce the
  // exact original calldata byte-for-byte. A mismatch means the ABI is
  // ambiguous, overloaded, or the decode is otherwise lossy — refuse
  // rather than send a call that might not be the one that was frozen.
  const reencoded = encodeFunctionData({ abi, functionName: decoded.functionName, args });
  if (reencoded.toLowerCase() !== call.calldata.toLowerCase()) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_CALLDATA_UNDECODABLE",
      `Decoded call for ${call.calldata} did not round-trip: re-encoding produced ${reencoded}. Refusing ` +
        "rather than sending a call that may not be the one that was frozen.",
    );
  }

  return { functionName: decoded.functionName, args };
}

function toWireFields(call: FrozenContractCall): KeeperHubContractCallWireFields {
  const { functionName, args } = decodeAndVerify(call);
  return {
    chainId: call.chainId,
    contractAddress: call.contractAddress,
    functionName,
    functionArgs: JSON.stringify(jsonSafe(args)),
    abi: JSON.stringify(call.abi),
    value: weiDecimalStringToEtherDecimalString(call.value),
  };
}

export function buildKeeperHubSimulationRequest(call: FrozenContractCall): KeeperHubSimulationRequestBody {
  return { ...toWireFields(call), simulate: true };
}

export function buildKeeperHubExecutionRequest(call: FrozenContractCall): KeeperHubExecutionRequestBody {
  return toWireFields(call);
}
