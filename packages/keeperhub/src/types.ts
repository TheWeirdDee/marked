import type { ChainId, Hex, HexAddress } from "@marked/core";

/**
 * A fully-explicit contract call. Every field is required — no optional
 * "defaults to 0" / "defaults to no value" convenience. See BUILD_CONTRACT.md
 * gate-derived invariant 39 and the Gate 1B incident that motivated it:
 * omission at a money-moving boundary is exactly what must be impossible.
 *
 * Field-to-wire mapping (see evidence/keeperhub/contract-call-schema.md,
 * read from KeeperHub's actual source, not guessed):
 *   - `calldata` -> KeeperHub's `data` field. KeeperHub decodes this back
 *     into a named function call using `abi`, so `abi` must be supplied
 *     explicitly — Marked never depends on KeeperHub's block-explorer
 *     ABI auto-fetch for a call it is about to authorize.
 *   - `value` is kept here in wei (Marked/viem convention) and converted
 *     to KeeperHub's ether-denominated decimal string only inside the
 *     provider serializer — see src/units.ts.
 */
export type FrozenContractCall = {
  chainId: ChainId;
  contractAddress: HexAddress;
  /** Raw calldata. Marked never asks KeeperHub (or itself) to infer calldata from a function name at this boundary. */
  calldata: Hex;
  /** Wei, as a decimal string. Always explicit, even for a zero-value call. */
  value: string;
  /** ABI covering the called function — required so KeeperHub can decode `calldata` without an explorer lookup. */
  abi: readonly unknown[];
};

/**
 * The only way to obtain permission to execute. Simulation code has no
 * path to construct one of these — see packages/keeperhub/src/client.ts.
 * `requestHash` must equal `hashContractCall(call)` for the exact call
 * being executed; a mismatch is a local refusal (KEEPERHUB_REQUEST_HASH_MISMATCH).
 *
 * This is a type/runtime safety boundary, not a cryptographic commitment
 * scheme — it does not replace the PRD's action-authorization hash
 * (packages/core/src/hash-domains.ts), which is Gate 2 work over the
 * canonical Governor action bundle. This hash only binds an execution
 * call to the exact request it was authorized against, inside this
 * package.
 */
export type ExplicitExecutionAuthorization = {
  intent: "EXECUTE";
  requestHash: Hex;
};

export type KeeperHubClientConfig = {
  apiKey: string;
  /** Hard safety gate — see packages/config/src/env.ts. Must be the parsed env value, never assumed. */
  enableMainnetWrite: boolean;
  baseUrl?: string;
  /** Injectable for tests — lets a test assert exact call count / exact serialized body. */
  fetchImpl?: typeof fetch;
};

export type SimulationResult = {
  success: boolean;
  wouldRevert: boolean;
  gasEstimate?: string | undefined;
  simulatedReturnValue?: unknown;
  raw: unknown;
};

export type ExecutionResult = {
  executionId: string;
  status: string;
  transactionHash?: string | undefined;
  raw: unknown;
};
