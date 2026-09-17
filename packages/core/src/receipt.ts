import { encodeAbiParameters, keccak256 } from "viem";
import type { ChainId, GovernorFamily, Hex, HexAddress } from "./types";
import type { PostconditionCoverage } from "./types";

/**
 * Gate 6 — the recomputable Marked Receipt (PRD's canonical sentence: "...
 * and emits a recomputable receipt for verified fulfillment, external
 * fulfillment, refusal, or unverified execution"). A receipt is only ever
 * produced once every leg of `reconcileForMarkedReceipt` has been checked —
 * never assembled from a single signal (KeeperHub status, receipt.status,
 * Governor state, or a Transfer event) in isolation.
 */
export type MarkedReceiptStatus = "FULFILLED_VERIFIED" | "FULFILLED_UNVERIFIED";

export type MarkedReceipt = {
  version: 1;
  fulfillmentCommitmentHash: Hex;
  frozenActionAuthorizationHash: Hex;
  finalGovernorAuthorizationHash: Hex;
  chainId: ChainId;
  governor: HexAddress;
  governorFamily: GovernorFamily;
  proposalId: string;
  actionIndex: number;
  executionTxHash: Hex;
  executionBlock: string;
  finalityBlock: string;
  governorFinalState: number;
  postconditionCoverage: PostconditionCoverage;
  requiredAssertionsVerified: boolean;
  status: MarkedReceiptStatus;
  observedAt: string;
};

export const RECEIPT_DOMAIN = "MARKED_RECEIPT_V1";

const RECEIPT_ENCODING_PARAMS = [
  { name: "domain", type: "string" },
  { name: "version", type: "uint8" },
  { name: "fulfillmentCommitmentHash", type: "bytes32" },
  { name: "frozenActionAuthorizationHash", type: "bytes32" },
  { name: "finalGovernorAuthorizationHash", type: "bytes32" },
  { name: "chainId", type: "uint256" },
  { name: "governor", type: "address" },
  { name: "governorFamily", type: "string" },
  { name: "proposalId", type: "uint256" },
  { name: "actionIndex", type: "uint256" },
  { name: "executionTxHash", type: "bytes32" },
  { name: "executionBlock", type: "uint256" },
  { name: "finalityBlock", type: "uint256" },
  { name: "governorFinalState", type: "uint256" },
  { name: "postconditionCoverage", type: "string" },
  { name: "requiredAssertionsVerified", type: "bool" },
  { name: "status", type: "string" },
] as const;

/** Canonical ABI encoding of a `MarkedReceipt` — never JSON, matching every other Marked commitment domain. `observedAt` is deliberately excluded: it is a timestamp annotation on when the receipt was assembled, not part of what is being attested to, so two honest recomputations of the same underlying facts at different times still hash identically. */
export function encodeReceipt(receipt: MarkedReceipt): Hex {
  return encodeAbiParameters(RECEIPT_ENCODING_PARAMS, [
    RECEIPT_DOMAIN,
    receipt.version,
    receipt.fulfillmentCommitmentHash,
    receipt.frozenActionAuthorizationHash,
    receipt.finalGovernorAuthorizationHash,
    BigInt(receipt.chainId),
    receipt.governor,
    receipt.governorFamily,
    BigInt(receipt.proposalId),
    BigInt(receipt.actionIndex),
    receipt.executionTxHash,
    BigInt(receipt.executionBlock),
    BigInt(receipt.finalityBlock),
    BigInt(receipt.governorFinalState),
    receipt.postconditionCoverage,
    receipt.requiredAssertionsVerified,
    receipt.status,
  ]);
}

export function computeReceiptHash(receipt: MarkedReceipt): Hex {
  return keccak256(encodeReceipt(receipt));
}

/**
 * Gate 6 instructions §2 — the core terminal invariant, implemented as a
 * single reconciliation gate no individual signal can bypass. Every field
 * here must independently agree before `verified: true` is possible; the
 * function contains no path that returns `true` from a subset of checks.
 */
export type ReconciliationInput = {
  frozenActionAuthorizationHash: Hex;
  /** Recorded by Gate 5 as the live re-check performed immediately before broadcast — a historical fact, not re-derivable after the fact (chain state has moved on since). */
  authorizationHashAtExecution: Hex;
  /** Freshly re-resolved by Gate 6, right now, from the live Governor. */
  finalAuthorizationHash: Hex;
  selectedActionIndex: number;
  postconditionBindingActionIndex: number;
  governorFinalState: number;
  requiredGovernorExecutedState: number;
  postconditionCoverage: PostconditionCoverage;
  requiredAssertionsVerified: boolean;
};

export type ReconciliationFailureCode =
  | "AUTHORIZATION_MISMATCH"
  | "ACTION_INDEX_MISMATCH"
  | "GOVERNOR_NOT_EXECUTED"
  | "POSTCONDITION_COVERAGE_INCOMPLETE"
  | "POSTCONDITION_NOT_VERIFIED";

export type ReconciliationResult = { verified: true } | { verified: false; code: ReconciliationFailureCode; reason: string };

export function reconcileForMarkedReceipt(input: ReconciliationInput): ReconciliationResult {
  if (input.frozenActionAuthorizationHash.toLowerCase() !== input.authorizationHashAtExecution.toLowerCase()) {
    return {
      verified: false,
      code: "AUTHORIZATION_MISMATCH",
      reason: `Frozen authorization (${input.frozenActionAuthorizationHash}) did not match the authorization recorded at execution time (${input.authorizationHashAtExecution}).`,
    };
  }
  if (input.frozenActionAuthorizationHash.toLowerCase() !== input.finalAuthorizationHash.toLowerCase()) {
    return {
      verified: false,
      code: "AUTHORIZATION_MISMATCH",
      reason: `Frozen authorization (${input.frozenActionAuthorizationHash}) does not match the authorization independently re-resolved now (${input.finalAuthorizationHash}).`,
    };
  }
  if (input.selectedActionIndex !== input.postconditionBindingActionIndex) {
    return {
      verified: false,
      code: "ACTION_INDEX_MISMATCH",
      reason: `Selected action index ${input.selectedActionIndex} does not correspond to the postcondition binding's action index ${input.postconditionBindingActionIndex}.`,
    };
  }
  if (input.governorFinalState !== input.requiredGovernorExecutedState) {
    return {
      verified: false,
      code: "GOVERNOR_NOT_EXECUTED",
      reason: `Governor final state ${input.governorFinalState} does not equal the required Executed state ${input.requiredGovernorExecutedState}.`,
    };
  }
  if (input.postconditionCoverage !== "FULL") {
    return {
      verified: false,
      code: "POSTCONDITION_COVERAGE_INCOMPLETE",
      reason: `Postcondition coverage is ${input.postconditionCoverage}, not FULL.`,
    };
  }
  if (!input.requiredAssertionsVerified) {
    return {
      verified: false,
      code: "POSTCONDITION_NOT_VERIFIED",
      reason: "One or more required postcondition assertions did not independently verify.",
    };
  }
  return { verified: true };
}
