/**
 * Gate 5 — deploys the controlled Sepolia Governor Bravo stack, bootstraps
 * Timelock admin transfer, creates a real ERC20-transfer proposal, votes it
 * through, and queues it. Every step is a real, unskipped on-chain
 * transaction and a real wait for the actual elapsed time/blocks — nothing
 * here mutates storage directly or shortcuts a require() check.
 *
 * This script uses the GATE5_DEPLOYER_PRIVATE_KEY test-fixture key — NOT
 * KeeperHub, and NOT part of Marked's own fulfillment path. The final,
 * authority-preserving step (KeeperHub calling Governor.execute(proposalId))
 * is a SEPARATE script: gate5-keeperhub-execute.ts.
 *
 * Idempotent/resumable: writes progress to evidence/lifecycle-fulfillment/deployment.json
 * after every step, and skips already-completed steps on rerun.
 *
 * Run with: pnpm --filter @marked/scripts exec tsx gate5-deploy-and-queue.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseAbi, encodeAbiParameters, formatEther, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "lifecycle-fulfillment");
const CONTRACTS_DIR = join(EVIDENCE_DIR, "contracts-src");
const STATE_FILE = join(EVIDENCE_DIR, "deployment.json");

(process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(join(REPO_ROOT, ".env.local"));

const RPC_URL = process.env["SEPOLIA_RPC_URL"] || "https://ethereum-sepolia-rpc.publicnode.com";
const DEPLOYER_KEY = process.env["GATE5_DEPLOYER_PRIVATE_KEY"] as Hex | undefined;
if (!DEPLOYER_KEY) throw new Error("GATE5_DEPLOYER_PRIVATE_KEY not set in .env.local");

const account = privateKeyToAccount(DEPLOYER_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL, { timeout: 30000 }) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL, { timeout: 30000 }) });

const VOTING_DELAY_BLOCKS = 1n;
const VOTING_PERIOD_BLOCKS = 10n;
const PROPOSAL_THRESHOLD = 1000n * 10n ** 18n;
const TIMELOCK_DELAY_SECONDS = 90n;
const TREASURY_FUNDING = 100000n * 10n ** 18n;
const GRANT_AMOUNT = 1000n * 10n ** 18n;

const tokenAbi = parseAbi([
  "constructor(address account)",
  "function delegate(address delegatee)",
  "function transfer(address dst, uint256 rawAmount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const timelockAbi = parseAbi([
  "constructor(address admin_, uint256 delay_)",
  "function admin() view returns (address)",
  "function queueTransaction(address target, uint256 value, string signature, bytes data, uint256 eta) returns (bytes32)",
  "function executeTransaction(address target, uint256 value, string signature, bytes data, uint256 eta) payable returns (bytes)",
]);

const governorAbi = parseAbi([
  "constructor(address timelock_, address comp_, uint256 votingPeriod_, uint256 votingDelay_, uint256 proposalThreshold_)",
  "function _initiate()",
  "function propose(address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, string description) returns (uint256)",
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id, address proposer, uint256 eta, uint256 startBlock, uint256 endBlock, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool canceled, bool executed)",
  "function castVote(uint256 proposalId, uint8 support)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function queue(uint256 proposalId)",
]);

type DeploymentState = {
  tokenAddress?: Hex;
  timelockAddress?: Hex;
  governorAddress?: Hex;
  recipientAddress?: Hex;
  selfDelegated?: boolean;
  treasuryFunded?: boolean;
  adminTransferQueuedTx?: Hex;
  adminTransferEta?: string;
  adminTransferExecutedTx?: Hex;
  initiatedTx?: Hex;
  proposalId?: string;
  proposeTx?: Hex;
  votedTx?: Hex;
  queuedTx?: Hex;
  queueEta?: string;
  txLog: { step: string; hash: string; blockNumber: string }[];
};

function loadState(): DeploymentState {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  return { txLog: [] };
}
function saveState(s: DeploymentState) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n", "utf8");
}

function loadCompiled(): Record<string, { abi: unknown; bytecode: Hex }> {
  return JSON.parse(readFileSync(join(CONTRACTS_DIR, "compiled.json"), "utf8"));
}

async function waitForReceipt(hash: Hex, label: string) {
  console.log(`  waiting for receipt: ${label} (${hash})...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120000 });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`  confirmed in block ${receipt.blockNumber}, gasUsed ${receipt.gasUsed}`);
  return receipt;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilTimestamp(targetTs: bigint, label: string) {
  console.log(`  waiting until on-chain timestamp >= ${targetTs} (${label})...`);
  for (;;) {
    const block = await publicClient.getBlock();
    if (block.timestamp >= targetTs) {
      console.log(`  reached: current timestamp ${block.timestamp}, block ${block.number}`);
      return;
    }
    const remaining = Number(targetTs - block.timestamp);
    await sleep(Math.min(15000, Math.max(3000, remaining * 1000)));
  }
}

async function waitUntilBlock(targetBlock: bigint, label: string) {
  console.log(`  waiting until block >= ${targetBlock} (${label})...`);
  for (;;) {
    const current = await publicClient.getBlockNumber();
    if (current >= targetBlock) {
      console.log(`  reached: current block ${current}`);
      return;
    }
    await sleep(6000);
  }
}

async function main() {
  console.log("MARKED — GATE 5 CONTROLLED SEPOLIA GOVERNOR DEPLOYMENT");
  console.log("Deployer:", account.address);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Deployer balance:", formatEther(balance), "ETH\n");

  const state = loadState();
  const compiled = loadCompiled();

  if (!state.tokenAddress) {
    console.log("[1] Deploying GovernanceToken...");
    const hash = await walletClient.deployContract({ abi: tokenAbi, bytecode: compiled["GovernanceToken"]!.bytecode, args: [account.address] });
    const receipt = await waitForReceipt(hash, "deploy GovernanceToken");
    state.tokenAddress = receipt.contractAddress!;
    state.txLog.push({ step: "deploy-token", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }
  console.log("  token:", state.tokenAddress);

  if (!state.timelockAddress) {
    console.log("[2] Deploying Timelock...");
    const hash = await walletClient.deployContract({ abi: timelockAbi, bytecode: compiled["Timelock"]!.bytecode, args: [account.address, TIMELOCK_DELAY_SECONDS] });
    const receipt = await waitForReceipt(hash, "deploy Timelock");
    state.timelockAddress = receipt.contractAddress!;
    state.txLog.push({ step: "deploy-timelock", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }
  console.log("  timelock:", state.timelockAddress);

  if (!state.governorAddress) {
    console.log("[3] Deploying GovernorBravoTestnetHarness...");
    const hash = await walletClient.deployContract({
      abi: governorAbi,
      bytecode: compiled["GovernorBravoTestnetHarness"]!.bytecode,
      args: [state.timelockAddress!, state.tokenAddress!, VOTING_PERIOD_BLOCKS, VOTING_DELAY_BLOCKS, PROPOSAL_THRESHOLD],
    });
    const receipt = await waitForReceipt(hash, "deploy GovernorBravoTestnetHarness");
    state.governorAddress = receipt.contractAddress!;
    state.txLog.push({ step: "deploy-governor", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }
  console.log("  governor:", state.governorAddress);

  if (!state.recipientAddress) {
    // Generated only to derive a fresh receiving address — the key itself is discarded immediately and never persisted (it is never used to sign anything; the address only needs to receive an ERC20 transfer).
    const pk = generatePrivateKey();
    state.recipientAddress = privateKeyToAccount(pk).address;
    saveState(state);
  }
  console.log("  recipient (grant target):", state.recipientAddress);

  if (!state.selfDelegated) {
    console.log("[4] Self-delegating voting power...");
    const hash = await walletClient.writeContract({ address: state.tokenAddress!, abi: tokenAbi, functionName: "delegate", args: [account.address] });
    const receipt = await waitForReceipt(hash, "delegate");
    state.selfDelegated = true;
    state.txLog.push({ step: "self-delegate", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }

  if (!state.treasuryFunded) {
    console.log("[5] Funding Timelock treasury...");
    const hash = await walletClient.writeContract({ address: state.tokenAddress!, abi: tokenAbi, functionName: "transfer", args: [state.timelockAddress!, TREASURY_FUNDING] });
    const receipt = await waitForReceipt(hash, "fund treasury");
    state.treasuryFunded = true;
    state.txLog.push({ step: "fund-treasury", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }

  if (!state.adminTransferQueuedTx) {
    console.log("[6] Queueing Timelock.setPendingAdmin(governor)...");
    const block = await publicClient.getBlock();
    const eta = block.timestamp + TIMELOCK_DELAY_SECONDS + 30n;
    const data = encodeAbiParameters([{ type: "address" }], [state.governorAddress!]);
    const hash = await walletClient.writeContract({
      address: state.timelockAddress!,
      abi: timelockAbi,
      functionName: "queueTransaction",
      args: [state.timelockAddress!, 0n, "setPendingAdmin(address)", data, eta],
    });
    const receipt = await waitForReceipt(hash, "queue setPendingAdmin");
    state.adminTransferQueuedTx = hash;
    state.adminTransferEta = eta.toString();
    state.txLog.push({ step: "queue-set-pending-admin", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }

  if (!state.adminTransferExecutedTx) {
    await waitUntilTimestamp(BigInt(state.adminTransferEta!), "timelock admin-transfer eta");
    console.log("[7] Executing Timelock.setPendingAdmin(governor)...");
    const data = encodeAbiParameters([{ type: "address" }], [state.governorAddress!]);
    const hash = await walletClient.writeContract({
      address: state.timelockAddress!,
      abi: timelockAbi,
      functionName: "executeTransaction",
      args: [state.timelockAddress!, 0n, "setPendingAdmin(address)", data, BigInt(state.adminTransferEta!)],
    });
    const receipt = await waitForReceipt(hash, "execute setPendingAdmin");
    state.adminTransferExecutedTx = hash;
    state.txLog.push({ step: "execute-set-pending-admin", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }

  if (!state.initiatedTx) {
    console.log("[8] Governor._initiate() — accepting Timelock admin role...");
    const hash = await walletClient.writeContract({ address: state.governorAddress!, abi: governorAbi, functionName: "_initiate", args: [] });
    const receipt = await waitForReceipt(hash, "_initiate");
    state.initiatedTx = hash;
    state.txLog.push({ step: "initiate", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }

  const timelockAdmin = await publicClient.readContract({ address: state.timelockAddress!, abi: timelockAbi, functionName: "admin" });
  console.log("  Timelock.admin is now:", timelockAdmin, timelockAdmin === state.governorAddress ? "(== governor, bootstrap complete)" : "(MISMATCH!)");

  if (!state.proposalId) {
    console.log("[9] Creating governance proposal: transfer(recipient, 1000 MTGT)...");
    const transferCalldata = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [state.recipientAddress!, GRANT_AMOUNT]);
    const hash = await walletClient.writeContract({
      address: state.governorAddress!,
      abi: governorAbi,
      functionName: "propose",
      args: [[state.tokenAddress!], [0n], ["transfer(address,uint256)"], [transferCalldata], "Gate 5 controlled test: grant 1000 MTGT to recipient"],
    });
    const receipt = await waitForReceipt(hash, "propose");
    const proposalCount = await publicClient.readContract({ address: state.governorAddress!, abi: governorAbi, functionName: "proposalCount" });
    state.proposalId = proposalCount.toString();
    state.proposeTx = hash;
    state.txLog.push({ step: "propose", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }
  console.log("  proposalId:", state.proposalId);

  if (!state.votedTx) {
    const proposal = await publicClient.readContract({ address: state.governorAddress!, abi: governorAbi, functionName: "proposals", args: [BigInt(state.proposalId!)] });
    await waitUntilBlock(proposal[3] + 1n, "proposal voting start");
    console.log("[10] Casting FOR vote...");
    const hash = await walletClient.writeContract({ address: state.governorAddress!, abi: governorAbi, functionName: "castVote", args: [BigInt(state.proposalId!), 1] });
    const receipt = await waitForReceipt(hash, "castVote");
    state.votedTx = hash;
    state.txLog.push({ step: "vote", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }

  if (!state.queuedTx) {
    const proposal = await publicClient.readContract({ address: state.governorAddress!, abi: governorAbi, functionName: "proposals", args: [BigInt(state.proposalId!)] });
    await waitUntilBlock(proposal[4] + 1n, "proposal voting end");
    const proposalState = await publicClient.readContract({ address: state.governorAddress!, abi: governorAbi, functionName: "state", args: [BigInt(state.proposalId!)] });
    console.log("  proposal state after voting:", proposalState, "(4 = Succeeded expected)");
    console.log("[11] Queueing proposal...");
    const hash = await walletClient.writeContract({ address: state.governorAddress!, abi: governorAbi, functionName: "queue", args: [BigInt(state.proposalId!)] });
    const receipt = await waitForReceipt(hash, "queue");
    const proposalAfter = await publicClient.readContract({ address: state.governorAddress!, abi: governorAbi, functionName: "proposals", args: [BigInt(state.proposalId!)] });
    state.queueEta = proposalAfter[2].toString();
    state.queuedTx = hash;
    state.txLog.push({ step: "queue", hash, blockNumber: receipt.blockNumber.toString() });
    saveState(state);
  }
  console.log("  queue eta:", state.queueEta);

  console.log("\n=== DEPLOYMENT + QUEUE PHASE COMPLETE ===");
  console.log("Governor:", state.governorAddress);
  console.log("Timelock:", state.timelockAddress);
  console.log("Token:", state.tokenAddress);
  console.log("Recipient:", state.recipientAddress);
  console.log("Proposal ID:", state.proposalId);
  console.log("Queue ETA:", state.queueEta, "— wait until this timestamp before running gate5-keeperhub-execute.ts");
  console.log("\nNo execution has occurred yet. gate5-keeperhub-execute.ts performs the actual KeeperHub lifecycle execution proof.");
}

main().catch((err) => {
  console.error("Deployment script crashed:", err);
  process.exitCode = 1;
});
