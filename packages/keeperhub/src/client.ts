import { KeeperHubProviderError } from "./errors";
import {
  assertLocalPreconditionsForExecution,
  assertLocalPreconditionsForSimulation,
} from "./local-validation";
import { buildKeeperHubExecutionRequest, buildKeeperHubSimulationRequest } from "./provider-request-builders";
import { hashContractCall } from "./request-hash";
import type {
  ExecutionResult,
  ExplicitExecutionAuthorization,
  FrozenContractCall,
  KeeperHubClientConfig,
  SimulationResult,
} from "./types";

const DEFAULT_BASE_URL = "https://app.keeperhub.com";
const CONTRACT_CALL_PATH = "/api/execute/contract-call";

async function postToKeeperHub(
  path: string,
  body: unknown,
  config: KeeperHubClientConfig,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const doFetch = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new KeeperHubProviderError("KEEPERHUB_RESPONSE_INVALID", `Network error calling KeeperHub ${path}`, cause);
  }

  if (response.status === 401 || response.status === 403) {
    throw new KeeperHubProviderError("KEEPERHUB_AUTH_REQUIRED", `KeeperHub rejected the API key (HTTP ${response.status}).`);
  }
  if (response.status === 429) {
    throw new KeeperHubProviderError("KEEPERHUB_RATE_LIMITED", "KeeperHub rate limit exceeded.");
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new KeeperHubProviderError("KEEPERHUB_RESPONSE_INVALID", "KeeperHub response was not valid JSON.", cause);
  }

  if (!response.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new KeeperHubProviderError("KEEPERHUB_RESPONSE_INVALID", `KeeperHub returned an error: ${message}`);
  }

  return json;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function parseSimulationResponse(json: unknown): SimulationResult {
  const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const wouldRevert = obj["wouldRevert"] === true;
  const success = obj["success"] === true;
  if (wouldRevert) {
    throw new KeeperHubProviderError(
      "KEEPERHUB_SIMULATION_REVERT",
      `Simulation predicts revert: ${JSON.stringify(json)}`,
    );
  }
  return {
    success,
    wouldRevert,
    gasEstimate: readOptionalString(obj, "gasEstimate"),
    simulatedReturnValue: obj["simulatedReturnValue"],
    raw: json,
  };
}

function parseExecutionResponse(json: unknown): ExecutionResult {
  const obj = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const executionId = readOptionalString(obj, "executionId");
  const status = readOptionalString(obj, "status");
  if (!executionId || !status) {
    throw new KeeperHubProviderError(
      "KEEPERHUB_RESPONSE_INVALID",
      `KeeperHub execution response missing executionId/status: ${JSON.stringify(json)}`,
    );
  }
  return {
    executionId,
    status,
    transactionHash: readOptionalString(obj, "transactionHash"),
    raw: json,
  };
}

/**
 * Dry-run a contract call through KeeperHub. Never broadcasts, on any
 * chain, regardless of ENABLE_MAINNET_WRITE — simulation causes no state
 * change. Cannot be turned into a real execution by any argument this
 * function accepts; there is no path from this function to
 * `executeContractCall` other than the caller writing new code.
 */
export async function simulateContractCall(
  call: FrozenContractCall,
  config: KeeperHubClientConfig,
): Promise<SimulationResult> {
  assertLocalPreconditionsForSimulation(call);
  const body = buildKeeperHubSimulationRequest(call);
  const json = await postToKeeperHub(CONTRACT_CALL_PATH, body, config);
  return parseSimulationResponse(json);
}

/**
 * Execute a contract call for real through KeeperHub. Requires an
 * `ExplicitExecutionAuthorization` whose `requestHash` matches this exact
 * call — see packages/keeperhub/src/request-hash.ts. Fails closed, with
 * zero network calls, on any malformed input, an unsupported chain, a
 * missing/invalid authorization, a request-hash mismatch, or a mainnet
 * chain while `ENABLE_MAINNET_WRITE` is not `true`.
 *
 * Sends an `Idempotency-Key` header derived from the same request hash —
 * KeeperHub's write path keys idempotency off the request (see
 * evidence/keeperhub/contract-call-schema.md); simulation never sends one,
 * since KeeperHub's simulate path "never signs, broadcasts, or reserves."
 */
export async function executeContractCall(
  call: FrozenContractCall,
  authorization: ExplicitExecutionAuthorization,
  config: KeeperHubClientConfig,
): Promise<ExecutionResult> {
  assertLocalPreconditionsForExecution(call, authorization, { enableMainnetWrite: config.enableMainnetWrite });
  const body = buildKeeperHubExecutionRequest(call);
  const json = await postToKeeperHub(CONTRACT_CALL_PATH, body, config, {
    "Idempotency-Key": hashContractCall(call),
  });
  return parseExecutionResponse(json);
}
