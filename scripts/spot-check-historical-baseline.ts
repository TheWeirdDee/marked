/**
 * Gate 8 §29 — manual/auditable spot-checks.
 *
 * Independently re-verifies five specific records from the committed
 * `historical-governor-fulfillment.json` against canonical chain data,
 * using a DIFFERENT public RPC endpoint than the one the primary pipeline
 * used (llamarpc instead of viem's default mainnet transport), so this is
 * not just "the same script re-run" — it is a second, independent read of
 * the chain.
 *
 * For each record this checks:
 *   1. The execution block's timestamp equals the record's `executedAt`.
 *   2. The execution transaction exists, succeeded, and the GOVERNOR
 *      contract itself emitted a `ProposalExecuted(id)` event within it
 *      (checked via the receipt's logs, not the transaction's top-level
 *      `to` field — see note below on why `to` is not a reliable signal).
 *   3. The queue transaction (when present) exists, succeeded, and the
 *      governor emitted `ProposalQueued(id, eta)` within it with `eta`
 *      equal to the record's `executionEligibleAt`.
 *   4. The governor's current `proposals(id).eta` still equals the record's
 *      `executionEligibleAt` (the eligibility timestamp is immutable
 *      on-chain data, not a derived guess).
 *   5. `executedAt - executionEligibleAt === fulfillmentIntervalSeconds`.
 *
 * NOTE on `to` vs. event-emission checks (discovered during this spot-check,
 * not assumed in advance): Compound #150's queue and execute transactions
 * were both sent to an intermediary relay/batcher contract
 * (0x02777053d6764996e594c3e88af1d58d5363a2e6), not directly to the
 * Governor. The Governor itself still emitted the correct
 * ProposalQueued/ProposalExecuted events with the correct id and eta inside
 * those transactions — some historical proposals were queued/executed via a
 * helper contract rather than a direct EOA-to-Governor call. Asserting
 * `receipt.to === governor` would therefore be a false-negative check; the
 * governor's own event emission is the correct, routing-independent signal,
 * and is what both this script and the primary pipeline actually key off.
 *
 * Run with: pnpm spot-check:historical
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbiItem, parseEventLogs, type AbiEvent } from "viem";
import { mainnet } from "viem/chains";
import { BRAVO_PROPOSALS_ABI } from "@marked/governor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "historical");

// Deliberately NOT the same endpoint the primary pipeline used (viem's
// default mainnet transport, https://ethereum.reth.rs/rpc). An independent
// spot-check should not depend on the same server being honest.
//
// Candidates tried and rejected before this one: https://eth.llamarpc.com
// (down — HTTP 525 SSL handshake failure at the time of this run),
// https://ethereum-rpc.publicnode.com (free tier requires a personal token
// for archive-depth eth_getLogs/eth_getTransactionReceipt on transactions
// this old), https://rpc.ankr.com/eth (requires an API key outright). This
// one was verified live to serve both archive getLogs and receipts for
// multi-year-old blocks with no key required.
const SPOT_CHECK_RPC = "https://eth.drpc.org";

const client = createPublicClient({ chain: mainnet, transport: http(SPOT_CHECK_RPC) });

const PROPOSAL_QUEUED_EVENT = parseAbiItem(
  "event ProposalQueued(uint256 id, uint256 eta)",
) as AbiEvent;
const PROPOSAL_EXECUTED_EVENT = parseAbiItem("event ProposalExecuted(uint256 id)") as AbiEvent;

type FulfillmentRecord = {
  dao: "Compound" | "Uniswap";
  proposalId: string;
  chainId: number;
  governor: string;
  family: string;
  executionEligibleAt: number;
  executedAt: number;
  fulfillmentIntervalSeconds: number;
  queueTxHash: string | null;
  queueBlock: string | null;
  executionTxHash: string;
  executionBlock: string;
};

function loadDataset(): { records: FulfillmentRecord[] } {
  return JSON.parse(
    readFileSync(join(EVIDENCE_DIR, "historical-governor-fulfillment.json"), "utf8"),
  ) as { records: FulfillmentRecord[] };
}

function findRecord(records: FulfillmentRecord[], dao: string, proposalId: string): FulfillmentRecord {
  const rec = records.find((r) => r.dao === dao && r.proposalId === proposalId);
  if (!rec) throw new Error(`Spot-check target ${dao} #${proposalId} not found in committed dataset.`);
  return rec;
}

type CheckResult = { label: string; pass: boolean; detail: string };

async function spotCheckRecord(record: FulfillmentRecord): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const governor = record.governor as `0x${string}`;

  // 1. Execution block timestamp matches executedAt.
  const execBlock = await client.getBlock({ blockNumber: BigInt(record.executionBlock) });
  results.push({
    label: "execution block timestamp == executedAt",
    pass: Number(execBlock.timestamp) === record.executedAt,
    detail: `block ${record.executionBlock} timestamp=${execBlock.timestamp} vs record executedAt=${record.executedAt}`,
  });

  // 2. Execution transaction exists, succeeded, and the GOVERNOR (not
  //    necessarily the tx's top-level `to` — see file header note on relay
  //    contracts) emitted ProposalExecuted(id) within it.
  const execReceipt = await client.getTransactionReceipt({ hash: record.executionTxHash as `0x${string}` });
  const executedLogs = parseEventLogs({
    abi: [PROPOSAL_EXECUTED_EVENT],
    logs: execReceipt.logs.filter((log) => log.address.toLowerCase() === governor.toLowerCase()),
  });
  const matchingExecutedLog = executedLogs.find((log) => (log.args as { id?: bigint }).id?.toString() === record.proposalId);
  results.push({
    label: "execution tx succeeded and governor emitted ProposalExecuted(id)",
    pass: execReceipt.status === "success" && matchingExecutedLog !== undefined,
    detail: `status=${execReceipt.status} to=${execReceipt.to} governorEmittedProposalExecuted=${matchingExecutedLog !== undefined} blockNumber=${execReceipt.blockNumber} (expected block ${record.executionBlock})`,
  });

  // 3. Queue transaction (if present): succeeded, and the governor emitted
  //    ProposalQueued(id, eta) within it with eta matching executionEligibleAt.
  if (record.queueTxHash && record.queueBlock) {
    const queueReceipt = await client.getTransactionReceipt({ hash: record.queueTxHash as `0x${string}` });
    const queuedLogs = parseEventLogs({
      abi: [PROPOSAL_QUEUED_EVENT],
      logs: queueReceipt.logs.filter((log) => log.address.toLowerCase() === governor.toLowerCase()),
    });
    const matchingQueuedLog = queuedLogs.find((log) => (log.args as { id?: bigint }).id?.toString() === record.proposalId);
    results.push({
      label: "queue tx succeeded and governor emitted ProposalQueued(id)",
      pass: queueReceipt.status === "success" && matchingQueuedLog !== undefined,
      detail: `status=${queueReceipt.status} to=${queueReceipt.to} governorEmittedProposalQueued=${matchingQueuedLog !== undefined} blockNumber=${queueReceipt.blockNumber} (expected block ${record.queueBlock})`,
    });

    const emittedEta = matchingQueuedLog ? (matchingQueuedLog.args as { eta?: bigint }).eta : undefined;
    results.push({
      label: "ProposalQueued event eta == executionEligibleAt",
      pass: emittedEta !== undefined && Number(emittedEta) === record.executionEligibleAt,
      detail: `emitted eta=${emittedEta?.toString() ?? "NOT FOUND"} vs record executionEligibleAt=${record.executionEligibleAt}`,
    });
  } else {
    results.push({
      label: "queue tx checks",
      pass: true,
      detail: "no queueTxHash recorded for this record — skipped (not required for all records)",
    });
  }

  // 4. Current on-chain proposals(id).eta still matches the record.
  const proposal = await client.readContract({
    address: governor,
    abi: BRAVO_PROPOSALS_ABI,
    functionName: "proposals",
    args: [BigInt(record.proposalId)],
  });
  const onChainEta = Number(proposal[2]);
  results.push({
    label: "current proposals(id).eta == executionEligibleAt",
    pass: onChainEta === record.executionEligibleAt,
    detail: `on-chain eta=${onChainEta} vs record executionEligibleAt=${record.executionEligibleAt}`,
  });

  // 5. Arithmetic sanity check.
  const recomputedInterval = record.executedAt - record.executionEligibleAt;
  results.push({
    label: "executedAt - executionEligibleAt == fulfillmentIntervalSeconds",
    pass: recomputedInterval === record.fulfillmentIntervalSeconds,
    detail: `${record.executedAt} - ${record.executionEligibleAt} = ${recomputedInterval} vs recorded ${record.fulfillmentIntervalSeconds}`,
  });

  return results;
}

async function main() {
  const dataset = loadDataset();

  const targets: Array<{ dao: "Compound" | "Uniswap"; proposalId: string; reason: string }> = [
    { dao: "Compound", proposalId: "220", reason: "required case study (§18): a severe multi-day case" },
    { dao: "Uniswap", proposalId: "20", reason: "required case study (§18): the longest interval in the dataset" },
    { dao: "Compound", proposalId: "150", reason: "near-zero interval (12s, tied for the dataset minimum)" },
    { dao: "Compound", proposalId: "176", reason: ">24h interval (94488s / ~26.25h), not one of the top-10 longest" },
    { dao: "Compound", proposalId: "129", reason: "median-ish interval (108s, close to the overall median of 132s)" },
  ];

  console.log("MARKED — GATE 8 SPOT-CHECK");
  console.log(`Using independent RPC endpoint: ${SPOT_CHECK_RPC} (NOT the endpoint the primary pipeline used)\n`);

  let allPass = true;
  const report: Array<{ dao: string; proposalId: string; reason: string; record: FulfillmentRecord; checks: CheckResult[] }> = [];

  for (const target of targets) {
    const record = findRecord(dataset.records, target.dao, target.proposalId);
    console.log(`--- ${target.dao} #${target.proposalId} (${target.reason}) ---`);
    console.log(`  interval: ${record.fulfillmentIntervalSeconds}s | eligible: ${record.executionEligibleAt} | executed: ${record.executedAt}`);
    const checks = await spotCheckRecord(record);
    for (const check of checks) {
      if (!check.pass) allPass = false;
      console.log(`  ${check.pass ? "PASS" : "FAIL"}  ${check.label}`);
      console.log(`        ${check.detail}`);
    }
    report.push({ dao: target.dao, proposalId: target.proposalId, reason: target.reason, record, checks });
    console.log("");
  }

  console.log(`=== ${allPass ? "ALL SPOT-CHECKS PASS — independent RPC confirms the committed dataset" : "SPOT-CHECK FAILURE DETECTED — see above"} ===`);
  if (!allPass) process.exitCode = 1;

  return report;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
