/**
 * Local refusals — checks that run entirely inside Marked, before any
 * network call to KeeperHub. Added after Gate 1B incident 001 (see
 * evidence/keeperhub/incidents/001-omitted-simulate-executed.md): a
 * complete, valid request sent to a KeeperHub execution endpoint without
 * an explicit simulate flag executed for real. Marked's own boundary must
 * never depend on a provider default — every one of these checks must
 * pass, locally, with zero `fetch` calls, before execution is attempted.
 */
export type KeeperHubLocalRefusalCode =
  | "KEEPERHUB_CHAIN_NOT_SUPPORTED"
  | "KEEPERHUB_TARGET_MISSING"
  | "KEEPERHUB_CALLDATA_MISSING"
  | "KEEPERHUB_CALLDATA_UNDECODABLE"
  | "KEEPERHUB_ABI_MISSING"
  | "KEEPERHUB_VALUE_MISSING"
  | "KEEPERHUB_REQUEST_HASH_MISMATCH"
  | "KEEPERHUB_MAINNET_WRITE_DISABLED"
  | "KEEPERHUB_EXECUTION_AUTHORIZATION_MISSING"
  | "KEEPERHUB_EXECUTION_INTENT_INVALID";

export class KeeperHubLocalRefusalError extends Error {
  constructor(
    public readonly code: KeeperHubLocalRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "KeeperHubLocalRefusalError";
  }
}

/**
 * Failures that came back from KeeperHub itself (after a network call was
 * actually made). Distinct from local refusals, which never touch the
 * network.
 */
export type KeeperHubProviderFailureCode =
  | "KEEPERHUB_AUTH_REQUIRED"
  | "KEEPERHUB_RATE_LIMITED"
  | "KEEPERHUB_RESPONSE_INVALID"
  | "KEEPERHUB_SIMULATION_REVERT";

export class KeeperHubProviderError extends Error {
  constructor(
    public readonly code: KeeperHubProviderFailureCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "KeeperHubProviderError";
  }
}
