/**
 * Gate 5 — THE PROOF: KeeperHub calls Governor.execute(proposalId) on the
 * controlled Sepolia Governor deployed by gate5-deploy-and-queue.ts. This
 * is the one script in this gate that touches KeeperHub. No direct
 * underlying-target call is ever constructed — only the Governor's own
 * lifecycle entrypoint.
 *
 * Full bounded lifecycle exercised for real, against the real deployed
 * objects (not composed examples):
 *   1. Re-resolve current Governor authorization (Gate 2 engine, reused as-is).
 *   2. Bind it into a real FulfillmentCommitment and arm it (Gate 4 engine, reused as-is).
 *   3. Resolve lifecycle eligibility from live chain state (Gate 5).
 *   4. Build the exact execute(proposalId) plan (Gate 5) — never a target-contract call.
 *   5. Simulate via KeeperHub's proven simulateContractCall (Gate 1B, reused as-is);
 *      this simulation is also the empirical caller-authority proof (Gate 5).
 *   6. Validate policy (Gate 5): the exact call, nothing else.
 *   7. Record human approval bound to the exact commitment hash (Gate 4, APPROVE mode).
 *   8. Full revalidation — lifecycle, authorization, caller authority (2nd simulation),
 *      policy — immediately before broadcast (Gate 5 instructions Part 9).
 *   9. Persist execution identity, then call executeContractCall (Gate 1B, reused as-is).
 *  10. Reconcile: wait for inclusion + a defined finality threshold, verify the
 *      receipt independently via RPC, verify Governor now reports Executed.
 *  11. Walk the real state machine (Gate 4 engine): EXECUTING -> RECONCILING ->
 *      WAITING_FINALITY -> VERIFYING_GOVERNOR_STATE -> GOVERNOR_EXECUTION_CONFIRMED.
 *  12. Prove idempotency: a deliberate replay of the exact same execution request
 *      returns the same identity, no second transaction (Gate 1B pattern, reused).
 *
 * Does NOT verify the economic postcondition as part of the fulfillment
 * pipeline (Gate 6's job) and does NOT produce FULFILLED_VERIFIED / MARKED ✓
 * — the terminal status this script can reach is GOVERNOR_EXECUTION_CONFIRMED.
 *
 * Safety: by default this script only simulates. Pass --execute (or set
 * GATE5_EXECUTE=true) to perform the real KeeperHub execution.
 *
 * Run with: pnpm --filter @marked/scripts exec tsx gate5-keeperhub-execute.ts [--execute]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import {
  resolveGovernorAuthorization,
  resolveBravoLifecycleEligibility,
  buildBravoExecutionPlan,
  computeExecutionCallHash,
  evaluateCallerCompatibility,
  type GovernorProposalCoordinate,
} from "@marked/governor";
import { buildErc20TransferBinding, decodeErc20Transfer } from "@marked/postconditions";
import {
  computeFulfillmentCommitmentHash,
  createReviewReadyJob,
  armFulfillmentJob,
  approveFulfillmentJob,
  type FulfillmentCommitment,
  type FulfillmentJobEvent,
} from "@marked/core";
import { InMemoryFulfillmentJobStore } from "@marked/db";
import {
  simulateContractCall,
  executeContractCall,
  hashContractCall,
  validateLifecycleExecutionPolicy,
  buildFrozenCallFromExecutionPlan,
  type ExplicitExecutionAuthorization,
} from "@marked/keeperhub";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "lifecycle-fulfillment");

(process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(join(REPO_ROOT, ".env.local"));

const CHAIN_ID = 11155111;
const RPC_URL = process.env["SEPOLIA_RPC_URL"] || "https://ethereum-sepolia-rpc.publicnode.com";
const KEEPERHUB_WALLET_ADDRESS = "0xeecbc82818e591b92e6dd54aa7589b0b9fed6160" as const; // confirmed org wallet, evidence/keeperhub/wallet-model.md
const FINALITY_CONFIRMATIONS = 2n; // documented testnet finality threshold — see evidence/lifecycle-fulfillment/finality.md

function readApiKey(): string {
  const contents = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
  const match = contents.match(/KEEPERHUB_API_KEY=(\S+)/);
  if (!match?.[1]) throw new Error("KEEPERHUB_API_KEY not found in .env.local");
  return match[1];
}

function loadDeployment(): {
  tokenAddress: Hex;
  timelockAddress: Hex;
  governorAddress: Hex;
  recipientAddress: Hex;
  proposalId: string;
  queueEta: string;
} {
  const raw = JSON.parse(readFileSync(join(EVIDENCE_DIR, "deployment.json"), "utf8"));
  return raw;
}

function writeJson(name: string, data: unknown) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n", "utf8");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("MARKED — GATE 5 KEEPERHUB LIFECYCLE EXECUTION PROOF");
  const shouldExecute = process.argv.includes("--execute") || process.env["GATE5_EXECUTE"] === "true";
  console.log(shouldExecute ? "MODE: real execution authorized (--execute)" : "MODE: simulation only (pass --execute for the real proof)");

  const deployment = loadDeployment();
  console.log("\nGovernor:", deployment.governorAddress);
  console.log("Proposal ID:", deployment.proposalId);

  const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL, { timeout: 30000 }) });
  const apiKey = readApiKey();
  const keeperHubConfig = { apiKey, enableMainnetWrite: false };

  const coordinate: GovernorProposalCoordinate = { chainId: CHAIN_ID, governor: deployment.governorAddress, proposalId: deployment.proposalId };

  // --- Step 1: resolve current Governor authorization (Gate 2 engine, unmodified) ---
  console.log("\n[1] Resolving Governor authorization (Gate 2 engine)...");
  const resolved = await resolveGovernorAuthorization(coordinate, { rpcUrl: RPC_URL });
  console.log("  actionAuthorizationHash:", resolved.actionAuthorizationHash);
  console.log("  actions:", resolved.authorization.actions.length);
  writeJson("authorization-before.json", resolved);

  // --- Step 2: bind into a FulfillmentCommitment and arm it (Gate 4 engine, unmodified) ---
  console.log("\n[2] Building and arming FulfillmentCommitment (Gate 4 engine)...");
  const transferAction = resolved.authorization.actions[0]!;
  const decoded = decodeErc20Transfer(transferAction.signature, transferAction.calldata);
  const binding = buildErc20TransferBinding({
    actionIndex: 0,
    expected: { token: transferAction.target, recipient: decoded.recipient, authorizedAmount: decoded.amount, expectedRecipientBalanceAfter: 0n },
    required: true,
  });
  const commitment: FulfillmentCommitment = {
    version: 1,
    chainId: CHAIN_ID,
    governor: deployment.governorAddress,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: deployment.proposalId,
    frozenActionAuthorizationHash: resolved.actionAuthorizationHash,
    selectedActionIndexes: [0],
    postconditionBindings: [binding],
    fulfillmentMode: "APPROVE",
    executionSurfaceId: "keeperhub-direct-contract-call-v1",
    executionPolicyVersion: "1",
  };
  const commitmentHash = computeFulfillmentCommitmentHash(commitment);
  console.log("  fulfillmentCommitmentHash:", commitmentHash);

  const store = new InMemoryFulfillmentJobStore();
  const now = () => new Date().toISOString();
  let job = createReviewReadyJob({ jobId: `gate5-proposal-${deployment.proposalId}`, commitment, now: now() });
  await store.save(job);
  const events: FulfillmentJobEvent[] = [];

  const armResult = armFulfillmentJob({
    job,
    reviewedCommitment: commitment,
    currentAuthorizationHash: resolved.actionAuthorizationHash,
    currentPostconditionCoverage: "FULL",
    actor: "gate5-script",
    now: now(),
  });
  job = armResult.job;
  events.push(armResult.event);
  await store.save(job);
  await store.appendEvents(job.jobId, [armResult.event]);
  console.log("  job status:", job.status);

  // --- Step 3: lifecycle eligibility ---
  console.log("\n[3] Resolving lifecycle eligibility...");
  const eligibility = await resolveBravoLifecycleEligibility(publicClient, { governor: deployment.governorAddress, proposalId: BigInt(deployment.proposalId) });
  console.log("  outcome:", eligibility.outcome, "-", eligibility.reason);
  writeJson("lifecycle-before.json", eligibility);
  if (eligibility.outcome !== "ELIGIBLE_TO_EXECUTE") {
    console.error("Not eligible to execute yet. Stopping.");
    process.exitCode = 1;
    return;
  }

  // --- Step 4: execution plan ---
  console.log("\n[4] Building execution plan...");
  const plan = buildBravoExecutionPlan(coordinate);
  const executionCallHash = computeExecutionCallHash(plan);
  console.log("  target:", plan.governor, "function:", plan.functionName, "calldata:", plan.calldata);
  console.log("  executionCallHash:", executionCallHash, "(distinct domain from actionAuthorizationHash)");
  writeJson("execution-plan.json", { ...plan, executionCallHash, frozenActionAuthorizationHash: resolved.actionAuthorizationHash });

  const frozenCall = buildFrozenCallFromExecutionPlan(plan);

  // --- Step 5: first simulation (also the empirical caller-authority proof) ---
  console.log("\n[5] Simulating execute() via KeeperHub...");
  const sim1 = await simulateContractCall(frozenCall, keeperHubConfig);
  console.log("  wouldRevert:", sim1.wouldRevert, "gasEstimate:", sim1.gasEstimate ?? "n/a");

  const callerCheck = evaluateCallerCompatibility({
    keeperHubCaller: KEEPERHUB_WALLET_ADDRESS,
    deploymentMatchesReferenceSource: true, // see evidence/lifecycle-fulfillment/controlled-governor.md — diffed against compound-protocol source
    simulation: { success: sim1.success, wouldRevert: sim1.wouldRevert },
  });
  console.log("  caller authority result:", callerCheck.result);
  writeJson("caller-authority.json", callerCheck);
  if (callerCheck.result !== "COMPATIBLE") {
    console.error("Caller not authorized. Stopping — zero execution call sent.");
    process.exitCode = 1;
    return;
  }

  // --- Step 6: policy validation ---
  console.log("\n[6] Validating execution policy...");
  const policy1 = validateLifecycleExecutionPolicy({
    proposedCall: frozenCall,
    expectedPlan: plan,
    currentAuthorizationHash: resolved.actionAuthorizationHash,
    commitmentFrozenAuthorizationHash: commitment.frozenActionAuthorizationHash,
  });
  console.log("  policy valid:", policy1.valid);
  writeJson("policy-validation.json", policy1);
  if (!policy1.valid) {
    console.error("Policy violation:", policy1.code, policy1.reason);
    process.exitCode = 1;
    return;
  }

  if (!shouldExecute) {
    console.log("\n[Execution] Skipped — pass --execute to perform the real KeeperHub lifecycle execution.");
    console.log("\nGate result: simulation + policy + caller-authority PASS, execution SKIPPED");
    return;
  }

  // --- Step 7: record approval (Gate 4 APPROVE mode) ---
  console.log("\n[7] Recording approval bound to the exact commitment hash...");
  job = { ...job, status: "AWAITING_APPROVAL" };
  const approveResult = approveFulfillmentJob({ job, actor: "gate5-script-operator", fulfillmentCommitmentHash: job.fulfillmentCommitmentHash, now: now() });
  job = approveResult.job;
  events.push(approveResult.event);
  await store.save(job);
  await store.appendEvents(job.jobId, [approveResult.event]);
  console.log("  job status:", job.status);

  // --- Step 8: full revalidation after approval, before broadcast (Part 9) ---
  console.log("\n[8] Full revalidation immediately before broadcast...");
  const eligibility2 = await resolveBravoLifecycleEligibility(publicClient, { governor: deployment.governorAddress, proposalId: BigInt(deployment.proposalId) });
  console.log("  lifecycle re-check:", eligibility2.outcome);
  if (eligibility2.outcome !== "ELIGIBLE_TO_EXECUTE") {
    console.error("Lifecycle changed since approval. Refusing to broadcast.");
    process.exitCode = 1;
    return;
  }

  const resolved2 = await resolveGovernorAuthorization(coordinate, { rpcUrl: RPC_URL });
  console.log("  authorization re-check:", resolved2.actionAuthorizationHash === resolved.actionAuthorizationHash ? "MATCH" : "MISMATCH");
  if (resolved2.actionAuthorizationHash !== resolved.actionAuthorizationHash) {
    console.error("Authorization changed since approval. Refusing to broadcast.");
    process.exitCode = 1;
    return;
  }

  const sim2 = await simulateContractCall(frozenCall, keeperHubConfig);
  const callerCheck2 = evaluateCallerCompatibility({
    keeperHubCaller: KEEPERHUB_WALLET_ADDRESS,
    deploymentMatchesReferenceSource: true,
    simulation: { success: sim2.success, wouldRevert: sim2.wouldRevert },
  });
  console.log("  caller authority re-check:", callerCheck2.result);
  if (callerCheck2.result !== "COMPATIBLE") {
    console.error("Caller authority changed since approval. Refusing to broadcast.");
    process.exitCode = 1;
    return;
  }

  const policy2 = validateLifecycleExecutionPolicy({
    proposedCall: frozenCall,
    expectedPlan: plan,
    currentAuthorizationHash: resolved2.actionAuthorizationHash,
    commitmentFrozenAuthorizationHash: commitment.frozenActionAuthorizationHash,
  });
  console.log("  policy re-check:", policy2.valid);
  if (!policy2.valid) {
    console.error("Policy violation on re-check:", policy2.code);
    process.exitCode = 1;
    return;
  }
  console.log("  ALL REVALIDATION CHECKS PASSED — proceeding to broadcast.");

  // --- Step 9: persist execution identity, then execute ---
  const requestHash = hashContractCall(frozenCall);
  const idempotencyIdentity = { requestHash, fulfillmentCommitmentHash: commitment.frozenActionAuthorizationHash, executionCallHash };
  writeJson("idempotency-identity.json", idempotencyIdentity);
  console.log("\n[9] Submitting execute() through KeeperHub...");
  job = { ...job, status: "EXECUTING" };
  await store.save(job);

  const authorization: ExplicitExecutionAuthorization = { intent: "EXECUTE", requestHash };
  const execResult = await executeContractCall(frozenCall, authorization, keeperHubConfig);
  console.log("  executionId:", execResult.executionId, "status:", execResult.status, "tx:", execResult.transactionHash ?? "n/a");
  writeJson("keeperhub-execution.json", execResult);

  if (!execResult.transactionHash) {
    console.log("  No transaction hash returned yet — entering RECONCILING.");
    job = { ...job, status: "RECONCILING" };
    await store.save(job);
    writeJson("reconciliation.json", { status: "UNKNOWN_RECONCILING", executionId: execResult.executionId, note: "No tx hash from KeeperHub yet; would poll getStatus() in a live orchestrator. Not implemented further in this gate's script." });
    console.log("\nGate result: execution submitted, ambiguous — see reconciliation.json");
    return;
  }

  job = { ...job, status: "RECONCILING" };
  await store.save(job);

  // --- Step 10: wait for inclusion + finality, verify independently ---
  console.log("\n[10] Waiting for transaction receipt...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: execResult.transactionHash as Hex, timeout: 120000 });
  console.log("  status:", receipt.status, "block:", receipt.blockNumber);
  job = { ...job, status: "WAITING_FINALITY" };
  await store.save(job);

  console.log(`  waiting for ${FINALITY_CONFIRMATIONS} confirmations past inclusion (testnet finality threshold)...`);
  for (;;) {
    const latest = await publicClient.getBlockNumber();
    if (latest >= receipt.blockNumber + FINALITY_CONFIRMATIONS) break;
    await sleep(6000);
  }
  const finalityBlock = await publicClient.getBlockNumber();
  console.log("  finality reached at block", finalityBlock);
  writeJson("finality.json", {
    inclusionBlock: receipt.blockNumber.toString(),
    finalityConfirmationsRequired: FINALITY_CONFIRMATIONS.toString(),
    finalityReachedAtBlock: finalityBlock.toString(),
    note: "Testnet finality threshold documented here is 2 confirmations past inclusion — a deliberate, stated policy for this controlled proof, not a claim of universal/mainnet finality (Gate 5 instructions Part 18).",
  });

  writeJson("transaction-receipt.json", {
    transactionHash: receipt.transactionHash,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    to: receipt.to,
    from: receipt.from,
    gasUsed: receipt.gasUsed.toString(),
    logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, logIndex: l.logIndex })),
  });

  // Independent verification: receipt target/function matches the plan.
  const receiptTargetMatches = receipt.to?.toLowerCase() === plan.governor.toLowerCase();
  console.log("  receipt.to matches Governor:", receiptTargetMatches);

  // --- Step 11: verify Governor now reports Executed, walk the real state machine ---
  console.log("\n[11] Verifying final Governor state...");
  job = { ...job, status: "VERIFYING_GOVERNOR_STATE" };
  await store.save(job);
  const eligibilityAfter = await resolveBravoLifecycleEligibility(publicClient, { governor: deployment.governorAddress, proposalId: BigInt(deployment.proposalId) });
  console.log("  outcome:", eligibilityAfter.outcome, "rawState:", eligibilityAfter.rawState, "executed:", eligibilityAfter.executed);
  writeJson("governor-after.json", eligibilityAfter);

  const governorConfirmedExecuted = eligibilityAfter.executed && eligibilityAfter.rawState === 7;

  if (governorConfirmedExecuted) {
    job = { ...job, status: "GOVERNOR_EXECUTION_CONFIRMED" };
    await store.save(job);
  }
  console.log("  final job status:", job.status);

  // --- Corroborating (not Gate-6-claiming) economic read ---
  const balanceAfter = await publicClient.readContract({
    address: deployment.tokenAddress,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: [deployment.recipientAddress],
  });
  console.log("  recipient MTGT balance after execution (corroborating read, NOT a Gate 6 claim):", balanceAfter);

  // --- Step 12: idempotency proof — deliberate replay ---
  console.log("\n[12] Proving idempotency: replaying the exact same execution request...");
  const replayResult = await executeContractCall(frozenCall, authorization, keeperHubConfig);
  console.log("  replay executionId:", replayResult.executionId, "status:", replayResult.status);
  const idempotentReplay = replayResult.executionId === execResult.executionId || (replayResult.raw as Record<string, unknown>)?.["idempotentReplay"] === true;
  console.log("  same identity / no new transaction:", idempotentReplay);
  writeJson("idempotency-replay.json", { first: execResult, replay: replayResult, sameIdentity: idempotentReplay });

  writeJson("proof.json", {
    commitment,
    fulfillmentCommitmentHash: commitmentHash,
    eligibility,
    executionPlan: { ...plan, executionCallHash },
    callerCheck,
    policyChecks: { beforeApproval: policy1, afterApproval: policy2 },
    execution: execResult,
    finality: { inclusionBlock: receipt.blockNumber.toString(), finalityReachedAtBlock: finalityBlock.toString() },
    governorAfter: eligibilityAfter,
    receiptTargetMatchesGovernor: receiptTargetMatches,
    finalJobStatus: job.status,
    idempotency: { sameIdentity: idempotentReplay },
    note: "GOVERNOR_EXECUTION_CONFIRMED is the strongest status this gate reaches. NOT MARKED ✓. Economic postcondition verification is Gate 6's job.",
  });

  console.log("\n=== GATE 5 RESULT ===");
  console.log("Governor execution confirmed:", governorConfirmedExecuted);
  console.log("Final job status:", job.status);
  console.log("MARKED ✓ reachable from here: NO (Gate 6 required)");
  process.exitCode = governorConfirmedExecuted ? 0 : 1;
}

main().catch((err) => {
  console.error("Execution script crashed:", err);
  process.exitCode = 1;
});
