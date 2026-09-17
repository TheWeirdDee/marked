/**
 * Gate 6 — independent economic verification of the exact Gate 5
 * fulfillment object, reconciliation, and (only if everything agrees) the
 * first genuine Marked Receipt / MARKED ✓.
 *
 * NO new proposal, NO new Governor, NO new KeeperHub call, NO new token
 * transfer. This script is entirely read-only against already-settled
 * Sepolia state and the exact Gate 5 object (governor, proposalId,
 * executionTxHash below — identity only, never treated as economic truth).
 *
 * Per Gate 6 instructions §3: existing Gate 5 evidence is used only to
 * identify WHICH object to verify (which governor, which proposal, which
 * transaction hash) — this script never reads
 * evidence/lifecycle-fulfillment/transaction-receipt.json or
 * authorization-before.json as if their contents were already verified;
 * every authoritative fact below is freshly re-obtained from live RPC in
 * this run, using the already-proven Gate 2/Gate 3 engines unmodified.
 *
 * Run with: pnpm --filter @marked/scripts exec tsx gate6-verify-economic-postcondition.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Hex } from "viem";
import type { HexAddress } from "@marked/core";
import { sepolia } from "viem/chains";
import { resolveGovernorAuthorization, type GovernorProposalCoordinate } from "@marked/governor";
import { ERC20TransferAdapter, decodeErc20Transfer, buildErc20TransferBinding } from "@marked/postconditions";
import {
  buildProposalActionContext,
  computeFulfillmentCommitmentHash,
  reconcileForMarkedReceipt,
  computeReceiptHash,
  transition,
  type FulfillmentCommitment,
  type MarkedReceipt,
} from "@marked/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "marked-receipt");
const RPC_URL = process.env["SEPOLIA_RPC_URL"] || "https://ethereum-sepolia-rpc.publicnode.com";

// --- Object IDENTITY only (which proposal, which tx) — never treated as economic truth. Matches Gate 5 instructions §0. ---
const CHAIN_ID = 11155111;
const GOVERNOR: HexAddress = "0xe86cdc53f3c4f416be42f13f621be96ab9d30727";
const PROPOSAL_ID = "2";
const EXECUTION_TX_HASH: Hex = "0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb";
const EXECUTION_BLOCK = 11716393n;
const FINALITY_BLOCK = 11716395n;
// Historical fact recorded by Gate 5's own live pre-broadcast re-check (evidence/lifecycle-fulfillment/proof.json,
// "authorization re-check: MATCH" against the frozen hash) — a point-in-time observation that cannot be re-observed
// now (chain state has moved on since). Gate 6 independently re-confirms frozen == final below; this third leg is
// carried forward as Gate 5's own recorded historical evidence, not re-derived.
const FROZEN_ACTION_AUTHORIZATION_HASH: Hex = "0x2fe3f808910a5d89ff9d233d34ecd53fe66d89d3ce46e340891599e784167a3b";
const AUTHORIZATION_HASH_AT_EXECUTION: Hex = FROZEN_ACTION_AUTHORIZATION_HASH;
const SELECTED_ACTION_INDEX = 0;
const FULFILLMENT_MODE = "APPROVE" as const;
const EXECUTION_SURFACE_ID = "keeperhub-direct-contract-call-v1";
const EXECUTION_POLICY_VERSION = "1";
const REQUIRED_GOVERNOR_EXECUTED_STATE = 7;

const GOVERNOR_TIMELOCK_ABI = [{ type: "function", name: "timelock", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}
function writeJson(name: string, data: unknown) {
  ensureDir(EVIDENCE_DIR);
  writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n", "utf8");
}

async function main() {
  console.log("MARKED — GATE 6 INDEPENDENT ECONOMIC VERIFICATION");
  console.log("Object identity only (not trusted as economic truth): governor", GOVERNOR, "proposalId", PROPOSAL_ID, "tx", EXECUTION_TX_HASH);

  const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL, { timeout: 30000 }) });
  const coordinate: GovernorProposalCoordinate = { chainId: CHAIN_ID, governor: GOVERNOR, proposalId: PROPOSAL_ID };

  // --- §4/§5: independently re-resolve Governor authorization NOW, via the unmodified Gate 2 engine ---
  console.log("\n[1] Re-resolving Governor authorization (Gate 2 engine, fresh RPC reads)...");
  const resolved = await resolveGovernorAuthorization(coordinate, { rpcUrl: RPC_URL });
  console.log("  finalGovernorAuthorizationHash:", resolved.actionAuthorizationHash);
  console.log("  frozenActionAuthorizationHash: ", FROZEN_ACTION_AUTHORIZATION_HASH);
  console.log("  match:", resolved.actionAuthorizationHash.toLowerCase() === FROZEN_ACTION_AUTHORIZATION_HASH.toLowerCase());
  writeJson("authorization-final.json", resolved);

  const action = resolved.authorization.actions[SELECTED_ACTION_INDEX];
  if (!action) throw new Error(`No action at index ${SELECTED_ACTION_INDEX}`);

  // --- §4: expected economic state derived from Governor calldata, via the Gate 3 decoder — never hardcoded ---
  console.log("\n[2] Decoding the selected action through Gate 3 ERC20 transfer semantics...");
  const decoded = decodeErc20Transfer(action.signature, action.calldata);
  console.log("  token (= action.target):", action.target);
  console.log("  recipient (decoded from calldata):", decoded.recipient);
  console.log("  raw amount (decoded from calldata):", decoded.amount.toString());

  const supports = ERC20TransferAdapter.supports({
    chainId: CHAIN_ID,
    governor: GOVERNOR,
    proposalId: PROPOSAL_ID,
    actionIndex: SELECTED_ACTION_INDEX,
    target: action.target,
    value: action.value,
    signature: action.signature,
    calldata: action.calldata,
    authorizationHash: resolved.actionAuthorizationHash,
  });
  console.log("  ERC20TransferAdapter.supports:", supports);
  if (!supports) throw new Error("Selected action is not a supported ERC20 transfer — cannot proceed.");

  // --- §6: block-pinned pre/post state via the proposal action context ---
  const ctx = buildProposalActionContext({
    chainId: CHAIN_ID,
    governor: GOVERNOR,
    proposalId: PROPOSAL_ID,
    authorizationHash: resolved.actionAuthorizationHash,
    action,
    preStateBlock: (EXECUTION_BLOCK - 1n).toString(),
    executionBlock: EXECUTION_BLOCK.toString(),
    executionTxHash: EXECUTION_TX_HASH,
    verificationBlock: EXECUTION_BLOCK.toString(),
  });

  // --- §7: reuse ERC20TransferAdapter unmodified — snapshot, deriveExpected, verify ---
  console.log("\n[3] Running ERC20TransferAdapter (Gate 3 engine, unmodified) with fresh block-pinned reads...");
  const preState = await ERC20TransferAdapter.snapshot(client, ctx);
  const expected = ERC20TransferAdapter.deriveExpected(preState, ctx);
  const result = await ERC20TransferAdapter.verify(client, preState, expected, ctx);
  console.log("  recipient balance before:", preState.recipientBalanceBefore.toString(), "at block", preState.preStateBlock.toString());
  console.log("  recipient balance after: ", result.observed.recipientBalanceAfter.toString(), "at block", result.observed.verificationBlock.toString());
  console.log("  observed delta:", result.observed.observedDelta.toString(), "expected:", expected.authorizedAmount.toString());
  console.log("  balanceDeltaMatches:", result.observed.balanceDeltaMatches, "transferLogMatches:", result.observed.transferLogMatches);
  console.log("  adapter reason:", result.observed.reason, "verified:", result.verified);
  writeJson("postcondition-verification.json", { preState, expected, observed: result.observed, evidence: result.evidence, verified: result.verified });

  // --- Optional bonus: source (Timelock) balance corroboration, source derived from the Governor's own timelock() getter, never guessed ---
  console.log("\n[4] Bonus corroboration: source (Timelock) balance delta...");
  const timelockAddress = await client.readContract({ address: GOVERNOR, abi: GOVERNOR_TIMELOCK_ABI, functionName: "timelock" });
  const balanceOfAbi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
  const sourceBalanceBefore = await client.readContract({ address: action.target, abi: balanceOfAbi, functionName: "balanceOf", args: [timelockAddress], blockNumber: EXECUTION_BLOCK - 1n });
  const sourceBalanceAfter = await client.readContract({ address: action.target, abi: balanceOfAbi, functionName: "balanceOf", args: [timelockAddress], blockNumber: EXECUTION_BLOCK });
  console.log("  source (Timelock, from Governor.timelock()):", timelockAddress);
  console.log("  source balance before:", sourceBalanceBefore.toString(), "after:", sourceBalanceAfter.toString(), "delta:", (sourceBalanceAfter - sourceBalanceBefore).toString());
  writeJson("source-balance.json", {
    source: timelockAddress,
    sourceDerivedFrom: "Governor.timelock() — a live on-chain read, not guessed or taken from Gate 5 logs",
    sourceBalanceBefore: sourceBalanceBefore.toString(),
    sourceBalanceAfter: sourceBalanceAfter.toString(),
    sourceDelta: (sourceBalanceAfter - sourceBalanceBefore).toString(),
  });

  // --- Cross-check only, not authority: compare against Gate 4's postcondition binding, built the normal way, from the SAME freshly-decoded values ---
  const binding = buildErc20TransferBinding({ actionIndex: SELECTED_ACTION_INDEX, expected, required: true });

  const commitment: FulfillmentCommitment = {
    version: 1,
    chainId: CHAIN_ID,
    governor: GOVERNOR,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: PROPOSAL_ID,
    frozenActionAuthorizationHash: FROZEN_ACTION_AUTHORIZATION_HASH,
    selectedActionIndexes: [SELECTED_ACTION_INDEX],
    postconditionBindings: [binding],
    fulfillmentMode: FULFILLMENT_MODE,
    executionSurfaceId: EXECUTION_SURFACE_ID,
    executionPolicyVersion: EXECUTION_POLICY_VERSION,
  };
  const fulfillmentCommitmentHash = computeFulfillmentCommitmentHash(commitment);
  console.log("\n[5] fulfillmentCommitmentHash (recomputed):", fulfillmentCommitmentHash);

  // --- §5: authorization + coverage reconciliation — the core terminal invariant ---
  console.log("\n[6] Reconciling for the Marked Receipt (core terminal invariant)...");
  const reconciliation = reconcileForMarkedReceipt({
    frozenActionAuthorizationHash: FROZEN_ACTION_AUTHORIZATION_HASH,
    authorizationHashAtExecution: AUTHORIZATION_HASH_AT_EXECUTION,
    finalAuthorizationHash: resolved.actionAuthorizationHash,
    selectedActionIndex: SELECTED_ACTION_INDEX,
    postconditionBindingActionIndex: binding.actionIndex,
    governorFinalState: resolved.lifecycle.state,
    requiredGovernorExecutedState: REQUIRED_GOVERNOR_EXECUTED_STATE,
    postconditionCoverage: "FULL",
    requiredAssertionsVerified: result.verified,
  });
  console.log("  reconciliation:", reconciliation);
  writeJson("reconciliation.json", reconciliation);

  // --- Walk the real state machine: GOVERNOR_EXECUTION_CONFIRMED -> VERIFYING_POSTCONDITION -> (FULFILLED_VERIFIED | FULFILLED_UNVERIFIED) ---
  const afterVerifying = transition("GOVERNOR_EXECUTION_CONFIRMED", "VERIFYING_POSTCONDITION");
  const finalStatus = reconciliation.verified ? transition(afterVerifying, "FULFILLED_VERIFIED") : transition(afterVerifying, "FULFILLED_UNVERIFIED");
  console.log("\n[7] State machine walk: GOVERNOR_EXECUTION_CONFIRMED ->", afterVerifying, "->", finalStatus);

  const receipt: MarkedReceipt = {
    version: 1,
    fulfillmentCommitmentHash,
    frozenActionAuthorizationHash: FROZEN_ACTION_AUTHORIZATION_HASH,
    finalGovernorAuthorizationHash: resolved.actionAuthorizationHash,
    chainId: CHAIN_ID,
    governor: GOVERNOR,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: PROPOSAL_ID,
    actionIndex: SELECTED_ACTION_INDEX,
    executionTxHash: EXECUTION_TX_HASH,
    executionBlock: EXECUTION_BLOCK.toString(),
    finalityBlock: FINALITY_BLOCK.toString(),
    governorFinalState: resolved.lifecycle.state,
    postconditionCoverage: "FULL",
    requiredAssertionsVerified: result.verified,
    status: finalStatus as MarkedReceipt["status"],
    observedAt: new Date().toISOString(),
  };
  const receiptHash = computeReceiptHash(receipt);

  writeJson("receipt.json", receipt);
  writeJson("proof.json", {
    identity: { chainId: CHAIN_ID, governor: GOVERNOR, proposalId: PROPOSAL_ID, executionTxHash: EXECUTION_TX_HASH },
    authorization: { frozen: FROZEN_ACTION_AUTHORIZATION_HASH, atExecution: AUTHORIZATION_HASH_AT_EXECUTION, final: resolved.actionAuthorizationHash },
    decodedAction: { token: action.target, recipient: decoded.recipient, rawAmount: decoded.amount.toString() },
    postcondition: { preState, observed: result.observed, verified: result.verified },
    sourceCorroboration: { source: timelockAddress, sourceBalanceBefore: sourceBalanceBefore.toString(), sourceBalanceAfter: sourceBalanceAfter.toString() },
    reconciliation,
    receipt,
    receiptHash,
    finalStatus,
  });

  console.log("\n=== GATE 6 RESULT ===");
  console.log("Reconciliation verified:", reconciliation.verified);
  console.log("Final status:", finalStatus);
  console.log("receiptHash:", receiptHash);
  if (finalStatus === "FULFILLED_VERIFIED") {
    console.log("\nMARKED ✓");
  } else {
    console.log("\nNOT MARKED — see reconciliation.json for the exact reason.");
  }
  process.exitCode = finalStatus === "FULFILLED_VERIFIED" ? 0 : 1;
}

main().catch((err) => {
  console.error("Verification script crashed:", err);
  process.exitCode = 1;
});
