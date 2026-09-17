/**
 * Gate 3 live reproduction: proves ERC20TransferAdapter against a real,
 * historical, finalized Ethereum mainnet USDC transfer.
 *
 * HISTORICAL READ-ONLY ADAPTER FIXTURE.
 * NOT a Marked execution. NOT a KeeperHub execution. NOT a Cactus closed
 * loop. This transaction is not connected to any governance proposal —
 * Gate 3 instructions §31 explicitly permit an adapter-only historical
 * fixture, independent of Cactus/Governor/KeeperHub, to prove the economic
 * postcondition primitive on its own. The ProposalActionContext below
 * therefore carries "N/A" governance-identity fields, clearly labeled —
 * never a fabricated proposal.
 *
 * Read-only throughout. No execution, no KeeperHub call, no Governor call,
 * no ERC20 transfer or approval, no mainnet write of any kind.
 *
 * Run with: pnpm prove:erc20-postcondition
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, getAddress, formatUnits, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import type { ProposalActionContext } from "@marked/core";
import { ERC20TransferAdapter } from "@marked/postconditions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "postconditions", "historical-fixture");

// Publicly documented free archive RPC (verified in this session to serve
// eth_call at historical blocks — several "free public" RPCs do NOT, see
// evidence/postconditions/erc20-transfer-methodology.md "RPC selection").
// Override with ETHEREUM_RPC_URL if you have your own archive-capable endpoint.
const RPC_URL = process.env["ETHEREUM_RPC_URL"] || "https://rpc.mevblocker.io";

const USDC = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const FIXTURE_TX_HASH = "0xe604c01ee06183082d827a1872b94ebc0669849ece2f0549ea2ed5f53331d9ca" as const;
const TRANSFER_SELECTOR = "0xa9059cbb";

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}
function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n", "utf8");
}

async function main() {
  console.log("MARKED — ERC20 ECONOMIC POSTCONDITION PROOF");
  console.log("Historical read-only fixture. NOT Marked execution. NOT KeeperHub execution. NOT a Cactus closed loop.\n");
  ensureDir(EVIDENCE_DIR);

  const client: PublicClient = createPublicClient({ chain: mainnet, transport: http(RPC_URL, { timeout: 20000 }) });

  console.log("Chain: Ethereum mainnet (chainId 1)");
  console.log("Execution tx:", FIXTURE_TX_HASH);

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: FIXTURE_TX_HASH }),
    client.getTransactionReceipt({ hash: FIXTURE_TX_HASH }),
  ]);

  if (receipt.status !== "success") throw new Error(`Fixture tx did not succeed on-chain: status=${receipt.status}`);
  if (tx.to?.toLowerCase() !== USDC.toLowerCase()) throw new Error(`Fixture tx.to (${tx.to}) is not the USDC contract.`);
  if (!tx.input.startsWith(TRANSFER_SELECTOR)) throw new Error(`Fixture tx.input does not start with the transfer(address,uint256) selector.`);

  // Bravo-style calldata: selector stripped, as it would appear stored in a Governor Bravo action bundle (signature carried separately).
  const bravoStyleCalldata = ("0x" + tx.input.slice(10)) as `0x${string}`;

  const executionBlock = receipt.blockNumber;
  const preStateBlock = executionBlock - 1n;

  const [decimals, symbol] = await Promise.all([
    client.readContract({ address: USDC, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const, functionName: "decimals" }),
    client.readContract({ address: USDC, abi: [{ type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const, functionName: "symbol" }),
  ]);

  console.log("Token:", USDC, `(${symbol}, display only — decimals never affect verification)`);
  console.log("Action semantics: transfer(address,uint256)");
  console.log("Execution block:", executionBlock.toString());
  console.log("Pre-state block:", preStateBlock.toString());

  // The ONLY sanctioned inputs to the adapter: signature + calldata, decoded deterministically. No prose, no AI, no manual entry of recipient/amount.
  const ctx: ProposalActionContext = {
    chainId: 1,
    // This fixture is NOT a governance proposal — see file header. These three fields are explicitly non-authoritative placeholders, never a fabricated proposal.
    governor: "0x0000000000000000000000000000000000000000",
    proposalId: "N/A — standalone adapter fixture, not a governance proposal",
    actionIndex: 0,
    target: USDC,
    value: "0",
    signature: "transfer(address,uint256)",
    calldata: bravoStyleCalldata,
    authorizationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    preStateBlock: preStateBlock.toString(),
    executionBlock: executionBlock.toString(),
    executionTxHash: FIXTURE_TX_HASH,
    verificationBlock: executionBlock.toString(),
  };

  const supported = ERC20TransferAdapter.supports(ctx);
  console.log("\nAdapter supports this action:", supported);
  if (!supported) throw new Error("ERC20TransferAdapter does not support this fixture — cannot proceed.");

  async function runOnce(label: string) {
    const pre = await ERC20TransferAdapter.snapshot(client, ctx);
    const expected = ERC20TransferAdapter.deriveExpected(pre, ctx);
    const result = await ERC20TransferAdapter.verify(client, pre, expected, ctx);

    console.log(`\n[${label}]`);
    console.log("Recipient:", pre.recipient);
    console.log("Authorized amount raw:", expected.authorizedAmount.toString());
    console.log("Authorized amount display:", `${formatUnits(expected.authorizedAmount, decimals)} ${symbol}`);
    console.log("Recipient balance before:", pre.recipientBalanceBefore.toString());
    console.log("Recipient balance after:", result.observed.recipientBalanceAfter.toString());
    console.log("Observed delta:", result.observed.observedDelta.toString());
    console.log("Balance delta match:", result.observed.balanceDeltaMatches ? "PASS" : "FAIL");
    console.log("Matching Transfer log:", result.observed.transferLogMatches ? "YES" : "NO");
    console.log("Transfer log match:", result.observed.transferLogMatches ? "PASS" : "FAIL");
    console.log("Adapter reason:", result.observed.reason);
    console.log("ADAPTER VERIFICATION:", result.verified ? "PASS" : "FAIL");
    return { pre, expected, result };
  }

  const first = await runOnce("Run 1");
  const second = await runOnce("Run 2 (reproducibility check, same process)");

  const reproducible =
    first.result.verified === second.result.verified &&
    first.result.observed.observedDelta === second.result.observed.observedDelta &&
    first.expected.authorizedAmount === second.expected.authorizedAmount;

  console.log("\n[Reproducibility] same process, two independent runs:", reproducible ? "PASS — identical result" : "FAIL — result changed");

  writeJson(join(EVIDENCE_DIR, "fixture.json"), {
    chain: "ethereum-mainnet",
    chainId: 1,
    token: USDC,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    executionTxHash: FIXTURE_TX_HASH,
    executionBlock: executionBlock.toString(),
    preStateBlock: preStateBlock.toString(),
    sender: tx.from,
    recipient: first.pre.recipient,
    rawTxInput: tx.input,
    bravoStyleCalldata,
    signature: "transfer(address,uint256)",
    authorizedAmountRaw: first.expected.authorizedAmount.toString(),
    authorizedAmountDisplay: `${formatUnits(first.expected.authorizedAmount, decimals)} ${symbol}`,
    rpcUrl: RPC_URL,
  });

  writeJson(join(EVIDENCE_DIR, "receipt.json"), {
    transactionHash: FIXTURE_TX_HASH,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed.toString(),
    logCount: receipt.logs.length,
    logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, logIndex: l.logIndex })),
  });

  writeJson(join(EVIDENCE_DIR, "pre-state.json"), {
    preStateBlock: preStateBlock.toString(),
    token: USDC,
    recipient: first.pre.recipient,
    recipientBalanceBefore: first.pre.recipientBalanceBefore.toString(),
  });

  writeJson(join(EVIDENCE_DIR, "post-state.json"), {
    verificationBlock: executionBlock.toString(),
    recipientBalanceAfter: first.result.observed.recipientBalanceAfter.toString(),
    observedDelta: first.result.observed.observedDelta.toString(),
  });

  writeJson(join(EVIDENCE_DIR, "proof.json"), {
    ctx,
    expected: { token: first.expected.token, recipient: first.expected.recipient, authorizedAmount: first.expected.authorizedAmount.toString(), expectedRecipientBalanceAfter: first.expected.expectedRecipientBalanceAfter.toString() },
    observed: {
      recipientBalanceAfter: first.result.observed.recipientBalanceAfter.toString(),
      observedDelta: first.result.observed.observedDelta.toString(),
      verificationBlock: first.result.observed.verificationBlock.toString(),
      balanceDeltaMatches: first.result.observed.balanceDeltaMatches,
      transferLogMatches: first.result.observed.transferLogMatches,
      matchedTransferLog: first.result.observed.matchedTransferLog
        ? {
            logIndex: first.result.observed.matchedTransferLog.logIndex,
            from: first.result.observed.matchedTransferLog.from,
            to: first.result.observed.matchedTransferLog.to,
            amount: first.result.observed.matchedTransferLog.amount.toString(),
          }
        : null,
      reason: first.result.observed.reason,
    },
    verified: first.result.verified,
    evidence: first.result.evidence,
    reproducibility: { run1Verified: first.result.verified, run2Verified: second.result.verified, match: reproducible },
    resultLabel: "ADAPTER VERIFICATION: " + (first.result.verified ? "PASS" : "FAIL") + " — this is an adapter correctness proof, not a Marked product receipt. MARKED ✓ is not claimed here.",
  });

  console.log("\nRESULT:");
  console.log("ADAPTER VERIFICATION:", first.result.verified && reproducible ? "PASS" : "FAIL");
  console.log("(This is an adapter correctness proof, not a Marked fulfillment receipt. MARKED ✓ is not claimed for this historical fixture.)");

  process.exitCode = first.result.verified && reproducible ? 0 : 1;
}

main().catch((err) => {
  console.error("Reproduction script crashed:", err);
  process.exitCode = 1;
});
