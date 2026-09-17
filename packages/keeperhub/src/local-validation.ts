import { KeeperHubLocalRefusalError } from "./errors";
import { hashContractCall } from "./request-hash";
import type { ExplicitExecutionAuthorization, FrozenContractCall } from "./types";

const HEX_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
/** At least 4 bytes — KeeperHub's `selectorOf(data)` requires a full function selector. See evidence/keeperhub/contract-call-schema.md. */
const HEX_CALLDATA_PATTERN = /^0x([0-9a-fA-F]{2}){4,}$/;
const DECIMAL_STRING_PATTERN = /^[0-9]+$/;

/** Chains Marked knows about at all, Gate 1B scope. */
const KNOWN_CHAIN_IDS: ReadonlySet<number> = new Set([1, 11155111]);
/** Chains that require ENABLE_MAINNET_WRITE=true even to attempt execution. */
const MAINNET_CHAIN_IDS: ReadonlySet<number> = new Set([1]);

function assertWellFormedCall(call: FrozenContractCall): void {
  if (!KNOWN_CHAIN_IDS.has(call.chainId)) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_CHAIN_NOT_SUPPORTED",
      `chainId ${call.chainId} is not a chain Marked supports in this gate.`,
    );
  }
  if (!call.contractAddress || !HEX_ADDRESS_PATTERN.test(call.contractAddress)) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_TARGET_MISSING",
      `contractAddress is missing or malformed: ${String(call.contractAddress)}`,
    );
  }
  if (!call.calldata || !HEX_CALLDATA_PATTERN.test(call.calldata)) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_CALLDATA_MISSING",
      `calldata is missing or malformed: ${String(call.calldata)}`,
    );
  }
  if (call.value === undefined || call.value === null || !DECIMAL_STRING_PATTERN.test(call.value)) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_VALUE_MISSING",
      `value is missing or not an explicit decimal wei string: ${String(call.value)}`,
    );
  }
  if (!Array.isArray(call.abi) || call.abi.length === 0) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_ABI_MISSING",
      "abi is missing or empty. KeeperHub decodes calldata against an ABI to determine read/write " +
        "semantics; Marked never depends on its block-explorer auto-fetch for a call it authorizes.",
    );
  }
}

/**
 * Runs before every simulation request. No mainnet guard and no
 * authorization requirement — simulation never broadcasts and never moves
 * value, on any chain.
 */
export function assertLocalPreconditionsForSimulation(call: FrozenContractCall): void {
  assertWellFormedCall(call);
}

/**
 * Runs before every execution request. This is the check that would have
 * caught incident 001 had it existed then — see
 * evidence/keeperhub/incidents/001-omitted-simulate-executed.md.
 */
export function assertLocalPreconditionsForExecution(
  call: FrozenContractCall,
  authorization: ExplicitExecutionAuthorization | undefined,
  params: { enableMainnetWrite: boolean },
): void {
  assertWellFormedCall(call);

  if (MAINNET_CHAIN_IDS.has(call.chainId) && !params.enableMainnetWrite) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_MAINNET_WRITE_DISABLED",
      `chainId ${call.chainId} is a mainnet chain and ENABLE_MAINNET_WRITE is not true.`,
    );
  }

  if (!authorization) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_EXECUTION_AUTHORIZATION_MISSING",
      "Execution requires an ExplicitExecutionAuthorization; none was provided.",
    );
  }
  if (authorization.intent !== "EXECUTE") {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_EXECUTION_INTENT_INVALID",
      `authorization.intent must be "EXECUTE", got: ${String(authorization.intent)}`,
    );
  }
  const expectedHash = hashContractCall(call);
  if (authorization.requestHash !== expectedHash) {
    throw new KeeperHubLocalRefusalError(
      "KEEPERHUB_REQUEST_HASH_MISMATCH",
      `authorization.requestHash (${authorization.requestHash}) does not match the hash of the ` +
        `call being executed (${expectedHash}). Refusing rather than executing a call that does ` +
        `not match what was authorized.`,
    );
  }
}
