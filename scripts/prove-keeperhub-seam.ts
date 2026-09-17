/**
 * Gate 1B live reproduction: proves the KeeperHub execution seam using the
 * real, safety-redesigned adapter in packages/keeperhub — never a raw
 * exploratory fetch call. See evidence/keeperhub/ for the full narrative,
 * including incident 001 that this design responds to.
 *
 * Run with: pnpm prove:keeperhub
 *   - By default: SIMULATION ONLY. Safe to run any number of times — never
 *     broadcasts, never mutates state. This is the default deliberately;
 *     see BUILD_CONTRACT.md gate-derived invariant 40.
 *   - Pass --execute (or set PROVE_KEEPERHUB_EXECUTE=true) to also perform
 *     the real execution. This is provably safe to repeat: the
 *     Idempotency-Key is derived deterministically from the frozen call
 *     (see packages/keeperhub/src/request-hash.ts), so a repeat run
 *     replays the original transaction rather than broadcasting a new one
 *     — confirmed empirically in evidence/keeperhub/probe-001-erc20-approve/.
 *
 * This script performs real network I/O and is intentionally NOT part of
 * `pnpm test`, same rationale as scripts/prove-cactus-seam.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeContractCall,
  hashContractCall,
  simulateContractCall,
  type ExplicitExecutionAuthorization,
  type FrozenContractCall,
} from "@marked/keeperhub";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// The exact frozen call from evidence/keeperhub/probe-001-erc20-approve/.
const PROBE_CALL: FrozenContractCall = {
  chainId: 11155111,
  contractAddress: WETH_SEPOLIA,
  calldata:
    "0x095ea7b3000000000000000000000000000000000000000000000000000000000000dEaD0000000000000000000000000000000000000000000000000000000000000539",
  value: "0",
  abi: ERC20_APPROVE_ABI,
};

function readApiKey(): string {
  const envLocalPath = join(REPO_ROOT, ".env.local");
  try {
    const contents = readFileSync(envLocalPath, "utf8");
    const match = contents.match(/KEEPERHUB_API_KEY=(\S+)/);
    if (match?.[1]) return match[1];
  } catch {
    // fall through to process.env
  }
  const fromEnv = process.env["KEEPERHUB_API_KEY"];
  if (!fromEnv) {
    throw new Error("KEEPERHUB_API_KEY not found in .env.local or the environment.");
  }
  return fromEnv;
}

async function readAllowance(): Promise<bigint> {
  const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
  const OWNER = "0xeecbc82818e591b92e6dd54aa7589b0b9fed6160";
  const SPENDER = "0x000000000000000000000000000000000000dEaD";
  const pad32 = (hex: string) => hex.replace(/^0x/, "").padStart(64, "0");
  const data = `0xdd62ed3e${pad32(OWNER)}${pad32(SPENDER)}`;
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: WETH_SEPOLIA, data }, "latest"] }),
  });
  const json = (await res.json()) as { result: string };
  return BigInt(json.result);
}

async function main() {
  console.log("MARKED — KEEPERHUB SEAM PROOF");
  const apiKey = readApiKey();
  const config = { apiKey, enableMainnetWrite: false };

  console.log("\n[Simulation] WETH.approve(0x...dEaD, 1337) on Sepolia");
  const before = await readAllowance();
  console.log(`  allowance before: ${before}`);

  const simResult = await simulateContractCall(PROBE_CALL, config);
  console.log(`  wouldRevert: ${simResult.wouldRevert}, gasEstimate: ${simResult.gasEstimate ?? "n/a"}`);

  const afterSim = await readAllowance();
  console.log(`  allowance after simulation: ${afterSim} (${afterSim === before ? "MATCH — zero mutation" : "MISMATCH — state changed!"})`);
  if (afterSim !== before) {
    console.error("Simulation mutated state. Stopping — this should never happen.");
    process.exitCode = 1;
    return;
  }
  console.log("  Result: PASS");

  const shouldExecute = process.argv.includes("--execute") || process.env["PROVE_KEEPERHUB_EXECUTE"] === "true";
  if (!shouldExecute) {
    console.log("\n[Execution] Skipped — pass --execute or set PROVE_KEEPERHUB_EXECUTE=true to also run it.");
    console.log("\nGate result:\nsimulation PASS, execution SKIPPED");
    return;
  }

  console.log("\n[Execution] Sending (idempotent-safe — see evidence/keeperhub/probe-001-erc20-approve/)");
  const authorization: ExplicitExecutionAuthorization = { intent: "EXECUTE", requestHash: hashContractCall(PROBE_CALL) };
  const execResult = await executeContractCall(PROBE_CALL, authorization, config);
  console.log(`  executionId: ${execResult.executionId}, status: ${execResult.status}, tx: ${execResult.transactionHash ?? "n/a"}`);

  const afterExec = await readAllowance();
  console.log(`  allowance after execution: ${afterExec} (expected 1337): ${afterExec === 1337n ? "MATCH" : "MISMATCH"}`);
  console.log(`  Result: ${afterExec === 1337n ? "PASS" : "FAIL"}`);

  console.log(`\nGate result:\nsimulation PASS, execution ${afterExec === 1337n ? "PASS" : "FAIL"}`);
  process.exitCode = afterExec === 1337n ? 0 : 1;
}

main().catch((err) => {
  console.error("Reproduction script crashed:", err);
  process.exitCode = 1;
});
