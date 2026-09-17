import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Gate 9 — loads the REAL evidence JSON files this repository already
 * committed in Gates 1A-6. Nothing here fabricates a value; every field the
 * UI displays traces back to one of these files. Server-only (uses `fs`) —
 * never imported from a client component.
 */
const EVIDENCE_ROOT = join(process.cwd(), "..", "..", "evidence");

function readJson<T>(relativePath: string): T {
  const full = join(EVIDENCE_ROOT, relativePath);
  return JSON.parse(readFileSync(full, "utf8")) as T;
}

function tryReadJson<T>(relativePath: string): T | null {
  try {
    return readJson<T>(relativePath);
  } catch {
    return null;
  }
}

// --- Lane 1: live Cactus resolution of Compound #220 (Gate 1A / Gate 2) ---
export type CactusResolvedProposal = {
  organization: { id: string; slug: string; name: string };
  proposal: { title: string; onchainProposalId: string; url: string; status: string };
  chain: { chainId: number };
  governor: { address: string; kind: string };
  provenance: { endpoint: string; fetchedAt: string; sourceClassification: string; resolutionMethod: string };
};

export type GovernorAuthorizationEvidence = {
  version: number;
  chainId: number;
  governor: string;
  governorFamily: string;
  proposalId: string;
  actions: { actionIndex: number; target: string; value: string; signature: string; calldata: string }[];
};

export function loadLane1Cactus() {
  const resolved = tryReadJson<CactusResolvedProposal>("cactus/compound-220/resolved.json");
  const authorization = tryReadJson<GovernorAuthorizationEvidence>("governor/compound-220/authorization.json");
  const proof = tryReadJson<{ actionAuthorizationHash?: string; resolvedAtBlock?: string }>("governor/compound-220/proof.json");
  return { resolved, authorization, proof };
}

// --- Lane 2: controlled Sepolia fulfillment (Gate 5) ---
export type Gate5Deployment = {
  tokenAddress: string;
  timelockAddress: string;
  governorAddress: string;
  recipientAddress: string;
  proposalId: string;
  queueEta: string;
  txLog: { step: string; hash: string; blockNumber: string }[];
};

export type Gate5Proof = {
  commitment: {
    version: 1;
    chainId: number;
    governor: string;
    governorFamily: string;
    proposalId: string;
    frozenActionAuthorizationHash: string;
    selectedActionIndexes: number[];
    postconditionBindings: { actionIndex: number; adapterId: string; adapterVersion: string; required: boolean; bindingParams: { key: string; value: string }[] }[];
    fulfillmentMode: string;
    executionSurfaceId: string;
    executionPolicyVersion: string;
  };
  fulfillmentCommitmentHash: string;
  eligibility: { outcome: string; reason: string; stateLabel: string };
  executionPlan: { governor: string; proposalId: string; functionName: string; calldata: string; value: string; executionCallHash: string };
  callerCheck: { keeperHubCaller: string; result: string; deploymentMatchesReferenceSource: boolean; simulationConfirmedNoRevert: boolean };
  policyChecks: { beforeApproval: { valid: boolean }; afterApproval: { valid: boolean } };
  execution: { executionId: string; status: string; transactionHash: string };
  finality: { inclusionBlock: string; finalityReachedAtBlock: string };
  governorAfter: { rawState: number; stateLabel: string; executed: boolean };
  finalJobStatus: string;
  idempotency: { sameIdentity: boolean };
};

export function loadLane2Gate5() {
  const deployment = tryReadJson<Gate5Deployment>("lifecycle-fulfillment/deployment.json");
  const proof = tryReadJson<Gate5Proof>("lifecycle-fulfillment/proof.json");
  return { deployment, proof };
}

// --- Gate 6: the Marked Receipt ---
export type MarkedReceiptEvidence = {
  version: number;
  fulfillmentCommitmentHash: string;
  frozenActionAuthorizationHash: string;
  finalGovernorAuthorizationHash: string;
  chainId: number;
  governor: string;
  governorFamily: string;
  proposalId: string;
  actionIndex: number;
  executionTxHash: string;
  executionBlock: string;
  finalityBlock: string;
  governorFinalState: number;
  postconditionCoverage: string;
  requiredAssertionsVerified: boolean;
  status: string;
  observedAt: string;
};

export type Gate6Proof = {
  identity: { chainId: number; governor: string; proposalId: string; executionTxHash: string };
  authorization: { frozen: string; atExecution: string; final: string };
  decodedAction: { token: string; recipient: string; rawAmount: string };
  postcondition: {
    preState: { token: string; recipient: string; recipientBalanceBefore: string; preStateBlock: string };
    observed: { recipientBalanceAfter: string; observedDelta: string; verificationBlock: string; balanceDeltaMatches: boolean; transferLogMatches: boolean; reason: string };
    verified: boolean;
  };
  sourceCorroboration: { source: string; sourceBalanceBefore: string; sourceBalanceAfter: string };
  reconciliation: { verified: boolean };
  receipt: MarkedReceiptEvidence;
  receiptHash: string;
  finalStatus: string;
};

export function loadGate6Receipt() {
  const receipt = tryReadJson<MarkedReceiptEvidence>("marked-receipt/receipt.json");
  const proof = tryReadJson<Gate6Proof>("marked-receipt/proof.json");
  return { receipt, proof };
}

export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
