/**
 * Gate 8 — Historical Governor Fulfillment Baseline.
 *
 * Measures, for every proposal an in-scope Governor Bravo deployment
 * actually executed, the interval between when that proposal became
 * legally executable (the Timelock `eta`, an onchain timestamp the
 * Governor itself stored at queue time) and when its execution
 * transaction was actually mined. This is deliberately NOT
 * `proposalCreated -> executed` (Gate 8 instructions §3) — that would
 * count the mandatory voting period and mandatory timelock delay as if
 * they were operational delay, which they are not (§9).
 *
 * Read-only throughout: every network call is `eth_call`/`eth_getLogs`/
 * `eth_getBlockByNumber`. No transaction is ever sent.
 *
 * Run with: pnpm reproduce:historical
 *   Pass --refresh to force re-fetching raw chain evidence instead of
 *   using the committed cache under evidence/historical/raw/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbiItem, type AbiEvent, type Log } from "viem";
import { mainnet } from "viem/chains";
import { detectGovernorFamily, BRAVO_STATE_ABI, BRAVO_PROPOSALS_ABI, BRAVO_INITIAL_PROPOSAL_ID_ABI, bravoStateLabel } from "@marked/governor";
import { mapWithConcurrency, withRetry } from "./lib/concurrency";
import type { DaoName, ExclusionReason, ExclusionRecord, FulfillmentRecord, HistoricalDataset, ExclusionsFile } from "./lib/historical-baseline-types";
import {
  statsFor,
  classifyProposalState,
  isMigrationBoundary,
  computeFulfillmentInterval,
  queuedEtaIsConsistent,
  sortRecordsDeterministically,
  computeTopLongest,
  findDuplicateKeys,
} from "./lib/historical-baseline-math";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "historical");
const RAW_DIR = join(EVIDENCE_DIR, "raw");

const REFRESH = process.argv.includes("--refresh");

const PROPOSAL_COUNT_ABI = [{ inputs: [], name: "proposalCount", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }] as const;

const PROPOSAL_EXECUTED_EVENT = parseAbiItem("event ProposalExecuted(uint256 id)") as AbiEvent;
const PROPOSAL_QUEUED_EVENT = parseAbiItem("event ProposalQueued(uint256 id, uint256 eta)") as AbiEvent;

/** Empirically determined via binary search against the live public RPC this project uses — see evidence/historical/README.md "RPC range limit". Kept well under the observed ~100,000-block failure threshold for safety margin. */
const LOG_CHUNK_BLOCKS = 80_000n;
const LOG_CHUNK_CONCURRENCY = 6;
const CONTRACT_READ_CONCURRENCY = 15;
const BLOCK_TIMESTAMP_CONCURRENCY = 15;

type GovernorConfig = {
  dao: DaoName;
  governor: `0x${string}`;
  chainId: 1;
  /** A safe lower bound for log scanning — found via binary search on `getCode`, see evidence/historical/README.md. Scanning from here rather than block 0 is a large, harmless speed optimization: no events can exist before the contract itself existed. */
  deploymentBlockFloor: bigint;
};

const GOVERNORS: GovernorConfig[] = [
  { dao: "Compound", governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529", chainId: 1, deploymentBlockFloor: 12_006_099n },
  { dao: "Uniswap", governor: "0x408ED6354d4973f66138C91495F2f2FCbd8724C3", chainId: 1, deploymentBlockFloor: 13_059_157n },
];

const client = createPublicClient({ chain: mainnet, transport: http() });

function rawCachePath(dao: DaoName, name: string): string {
  return join(RAW_DIR, `${dao.toLowerCase()}-${name}.json`);
}

function readCache<T>(path: string): T | null {
  if (REFRESH || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeCache(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Chunked `getLogs` across a wide historical range, respecting the RPC's block-range limit (empirically ~100,000 blocks — see evidence/historical/README.md). Cached to disk so a re-run of this script never depends on hundreds of fresh RPC calls unless --refresh is passed. */
async function fetchEventLogsChunked(
  dao: DaoName,
  eventName: string,
  governor: `0x${string}`,
  event: AbiEvent,
  fromBlock: bigint,
): Promise<Log[]> {
  const cachePath = rawCachePath(dao, `${eventName}-logs`);
  const cached = readCache<{ logs: unknown[] }>(cachePath);
  if (cached) {
    console.log(`  [cache] ${dao} ${eventName}: ${cached.logs.length} events (from ${cachePath})`);
    return cached.logs as Log[];
  }

  const latest = await client.getBlockNumber();
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= latest; start += LOG_CHUNK_BLOCKS) {
    const end = start + LOG_CHUNK_BLOCKS - 1n > latest ? latest : start + LOG_CHUNK_BLOCKS - 1n;
    chunks.push({ from: start, to: end });
  }

  console.log(`  [live] ${dao} ${eventName}: scanning ${chunks.length} chunk(s) of ~${LOG_CHUNK_BLOCKS} blocks each...`);
  const chunkResults = await mapWithConcurrency(chunks, LOG_CHUNK_CONCURRENCY, async (chunk) =>
    withRetry(() => client.getLogs({ address: governor, event, fromBlock: chunk.from, toBlock: chunk.to })),
  );
  const logs = chunkResults.flat();
  console.log(`  [live] ${dao} ${eventName}: ${logs.length} events found`);

  writeCache(cachePath, {
    dao,
    governor,
    event: eventName,
    fromBlock: fromBlock.toString(),
    toBlock: latest.toString(),
    chunkBlocks: LOG_CHUNK_BLOCKS.toString(),
    fetchedAt: new Date().toISOString(),
    logs: serializeLogs(logs),
  });
  return logs;
}

function serializeLogs(logs: Log[]): SerializedLog[] {
  return logs.map((l) => {
    const rawArgs = (l as { args?: Record<string, unknown> }).args ?? {};
    const args: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawArgs)) {
      args[k] = typeof v === "bigint" ? v.toString() : String(v);
    }
    return {
      args,
      blockNumber: (l.blockNumber ?? 0n).toString(),
      transactionHash: l.transactionHash ?? "",
      logIndex: l.logIndex ?? 0,
    };
  });
}

type SerializedLog = { args: Record<string, string>; blockNumber: string; transactionHash: string; logIndex: number };

async function fetchBlockTimestamps(dao: DaoName, blockNumbers: bigint[]): Promise<Map<string, number>> {
  const cachePath = rawCachePath(dao, "execution-block-timestamps");
  const unique = [...new Set(blockNumbers.map((b) => b.toString()))];
  const cached = readCache<Record<string, number>>(cachePath);
  if (cached && unique.every((b) => b in cached)) {
    console.log(`  [cache] ${dao} block timestamps: ${unique.length} blocks (from ${cachePath})`);
    return new Map(Object.entries(cached));
  }

  console.log(`  [live] ${dao} block timestamps: fetching ${unique.length} unique block(s)...`);
  const results = await mapWithConcurrency(unique, BLOCK_TIMESTAMP_CONCURRENCY, async (bnStr) => {
    const block = await withRetry(() => client.getBlock({ blockNumber: BigInt(bnStr) }));
    return [bnStr, Number(block.timestamp)] as const;
  });
  const map = new Map(results);
  writeCache(cachePath, Object.fromEntries(map));
  return map;
}

type ProposalState = {
  id: bigint;
  state: number;
  eta: bigint;
  canceled: boolean;
  executed: boolean;
};

async function fetchProposalStates(dao: DaoName, governor: `0x${string}`, ids: bigint[]): Promise<Map<string, ProposalState>> {
  const cachePath = rawCachePath(dao, "proposal-states");
  const cached = readCache<{ proposals: Record<string, { state: number; eta: string; canceled: boolean; executed: boolean }> }>(cachePath);
  if (cached) {
    console.log(`  [cache] ${dao} proposal states: ${Object.keys(cached.proposals).length} proposals (from ${cachePath})`);
    return new Map(Object.entries(cached.proposals).map(([id, p]) => [id, { id: BigInt(id), state: p.state, eta: BigInt(p.eta), canceled: p.canceled, executed: p.executed }]));
  }

  console.log(`  [live] ${dao} proposal states: reading state()+proposals() for ${ids.length} proposal(s)...`);
  const results = await mapWithConcurrency(ids, CONTRACT_READ_CONCURRENCY, async (id) => {
    const [state, tuple] = await withRetry(() =>
      Promise.all([
        client.readContract({ address: governor, abi: BRAVO_STATE_ABI, functionName: "state", args: [id] }),
        client.readContract({ address: governor, abi: BRAVO_PROPOSALS_ABI, functionName: "proposals", args: [id] }),
      ]),
    );
    const [, , eta, , , , , , canceled, executed] = tuple;
    return [id.toString(), { id, state, eta, canceled, executed }] as const;
  });
  const map = new Map(results);
  writeCache(cachePath, {
    dao,
    governor,
    fetchedAt: new Date().toISOString(),
    proposals: Object.fromEntries([...map].map(([id, p]) => [id, { state: p.state, eta: p.eta.toString(), canceled: p.canceled, executed: p.executed }])),
  });
  return map;
}

async function processGovernor(config: GovernorConfig): Promise<{ records: FulfillmentRecord[]; exclusions: ExclusionRecord[] }> {
  console.log(`\n=== ${config.dao} (${config.governor}) ===`);

  const family = await detectGovernorFamily(client, config.governor);
  if (family !== "GOVERNOR_BRAVO") {
    throw new Error(`${config.dao}: Governor family probe did not return GOVERNOR_BRAVO (got ${family}) — refusing to guess a lifecycle model. Gate 8 supports Governor Bravo only.`);
  }
  console.log(`family: GOVERNOR_BRAVO (verified via initialProposalId() probe, not assumed)`);

  const proposalCount = await client.readContract({ address: config.governor, abi: PROPOSAL_COUNT_ABI, functionName: "proposalCount" });
  const initialProposalId = await client.readContract({ address: config.governor, abi: BRAVO_INITIAL_PROPOSAL_ID_ABI, functionName: "initialProposalId" });
  console.log(`proposalCount: ${proposalCount} | initialProposalId (migration boundary): ${initialProposalId}`);

  const exclusions: ExclusionRecord[] = [];
  const allIds: bigint[] = [];
  for (let id = 1n; id <= proposalCount; id++) allIds.push(id);
  for (const id of allIds) {
    if (isMigrationBoundary(id, initialProposalId)) {
      exclusions.push({ dao: config.dao, proposalId: id.toString(), reason: "MIGRATION_BOUNDARY", detail: `Proposal id <= initialProposalId (${initialProposalId}) belongs to a prior Governor deployment (e.g. GovernorAlpha), not this Bravo contract — out of scope for this gate.` });
    }
  }

  const validIds = allIds.filter((id) => !isMigrationBoundary(id, initialProposalId));

  const states = await fetchProposalStates(config.dao, config.governor, validIds);

  const executedIds: bigint[] = [];
  for (const id of validIds) {
    const p = states.get(id.toString());
    if (!p) {
      exclusions.push({ dao: config.dao, proposalId: id.toString(), reason: "RPC_DATA_UNAVAILABLE", detail: "No state()/proposals() result returned." });
      continue;
    }
    const classification = classifyProposalState(p.state, bravoStateLabel(p.state));
    if (classification.included) {
      executedIds.push(id);
    } else {
      exclusions.push({ dao: config.dao, proposalId: id.toString(), reason: classification.reason, detail: classification.detail });
    }
  }
  console.log(`executed (state==7): ${executedIds.length} of ${validIds.length} in-scope proposal(s)`);

  const [executedLogs, queuedLogs] = await Promise.all([
    fetchEventLogsChunked(config.dao, "proposal-executed", config.governor, PROPOSAL_EXECUTED_EVENT, config.deploymentBlockFloor),
    fetchEventLogsChunked(config.dao, "proposal-queued", config.governor, PROPOSAL_QUEUED_EVENT, config.deploymentBlockFloor),
  ]);

  const executedLogById = new Map<string, SerializedLog>();
  for (const log of serializeLogs(executedLogs)) executedLogById.set(log.args["id"]!, log);
  const queuedLogById = new Map<string, SerializedLog>();
  for (const log of serializeLogs(queuedLogs)) queuedLogById.set(log.args["id"]!, log);

  const executionBlocks = executedIds.map((id) => {
    const log = executedLogById.get(id.toString());
    return log ? BigInt(log.blockNumber) : null;
  }).filter((b): b is bigint => b !== null);
  const blockTimestamps = await fetchBlockTimestamps(config.dao, executionBlocks);

  const records: FulfillmentRecord[] = [];
  for (const id of executedIds) {
    const idStr = id.toString();
    const executedLog = executedLogById.get(idStr);
    if (!executedLog) {
      exclusions.push({ dao: config.dao, proposalId: idStr, reason: "MISSING_CANONICAL_EVENT", detail: "state()==Executed but no ProposalExecuted event was found in the scanned log range." });
      continue;
    }
    const p = states.get(idStr)!;
    const executedAt = blockTimestamps.get(executedLog.blockNumber);
    if (executedAt === undefined) {
      exclusions.push({ dao: config.dao, proposalId: idStr, reason: "RPC_DATA_UNAVAILABLE", detail: "Could not fetch the execution block's timestamp." });
      continue;
    }

    const queuedLog = queuedLogById.get(idStr) ?? null;
    // Cross-check: the ProposalQueued event's own eta (if found) must match the current proposals() eta — eta is immutable once queued.
    const queuedLogEta = queuedLog ? BigInt(queuedLog.args["eta"]!) : undefined;
    if (!queuedEtaIsConsistent(queuedLogEta, p.eta)) {
      exclusions.push({ dao: config.dao, proposalId: idStr, reason: "RPC_DATA_UNAVAILABLE", detail: `ProposalQueued event eta (${queuedLogEta}) does not match current proposals().eta (${p.eta}) — data integrity check failed.` });
      continue;
    }

    const executionEligibleAt = Number(p.eta);
    const intervalResult = computeFulfillmentInterval(executedAt, executionEligibleAt);
    if (!intervalResult.ok) {
      exclusions.push({ dao: config.dao, proposalId: idStr, reason: intervalResult.reason, detail: intervalResult.detail });
      continue;
    }
    const fulfillmentIntervalSeconds = intervalResult.intervalSeconds;

    records.push({
      dao: config.dao,
      proposalId: idStr,
      chainId: config.chainId,
      governor: config.governor,
      family: "GOVERNOR_BRAVO",
      executionEligibleAt,
      executedAt,
      fulfillmentIntervalSeconds,
      queueTxHash: queuedLog?.transactionHash ?? null,
      queueBlock: queuedLog?.blockNumber ?? null,
      executionTxHash: executedLog.transactionHash,
      executionBlock: executedLog.blockNumber,
    });
  }

  console.log(`included in final dataset: ${records.length}`);
  return { records, exclusions };
}

async function main() {
  console.log("MARKED — GATE 8 HISTORICAL GOVERNOR FULFILLMENT BASELINE");
  console.log(`Mode: ${REFRESH ? "REFRESH (live RPC)" : "cache-first (falls back to live RPC for anything not cached)"}\n`);

  const allRecords: FulfillmentRecord[] = [];
  const allExclusions: ExclusionRecord[] = [];

  for (const config of GOVERNORS) {
    const { records, exclusions } = await processGovernor(config);
    allRecords.push(...records);
    allExclusions.push(...exclusions);
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });

  const duplicateKeys = findDuplicateKeys(allRecords);
  if (duplicateKeys.length > 0) {
    throw new Error(`Gate 8: duplicate (dao, proposalId) keys found in the final dataset — refusing to write a corrupted dataset: ${duplicateKeys.join(", ")}`);
  }

  const dataset: HistoricalDataset = {
    generatedAt: new Date().toISOString(),
    methodology: "executionEligibleAt = Timelock eta (from Governor Bravo's own proposals().eta, an onchain timestamp); executedAt = timestamp of the block containing the ProposalExecuted event. fulfillmentIntervalSeconds = executedAt - executionEligibleAt. See evidence/historical/README.md.",
    percentileMethod: "linear interpolation between closest ranks (rank = p/100 * (n-1)), the same method used by numpy's default np.percentile",
    records: sortRecordsDeterministically(allRecords),
  };
  writeCache(join(EVIDENCE_DIR, "historical-governor-fulfillment.json"), dataset);

  const byDaoExclusionCounts: Record<DaoName, Partial<Record<ExclusionReason, number>>> = { Compound: {}, Uniswap: {} };
  const overallExclusionCounts: Partial<Record<ExclusionReason, number>> = {};
  for (const e of allExclusions) {
    byDaoExclusionCounts[e.dao][e.reason] = (byDaoExclusionCounts[e.dao][e.reason] ?? 0) + 1;
    overallExclusionCounts[e.reason] = (overallExclusionCounts[e.reason] ?? 0) + 1;
  }
  const exclusionsFile: ExclusionsFile = {
    generatedAt: new Date().toISOString(),
    byDao: byDaoExclusionCounts,
    overall: overallExclusionCounts,
    records: allExclusions,
  };
  writeCache(join(EVIDENCE_DIR, "exclusions.json"), exclusionsFile);

  const overallIntervals = allRecords.map((r) => r.fulfillmentIntervalSeconds);
  const byDao: Record<DaoName, ReturnType<typeof statsFor>> = {
    Compound: statsFor(allRecords.filter((r) => r.dao === "Compound").map((r) => r.fulfillmentIntervalSeconds)),
    Uniswap: statsFor(allRecords.filter((r) => r.dao === "Uniswap").map((r) => r.fulfillmentIntervalSeconds)),
  };
  const topLongest = computeTopLongest(allRecords, 10);

  const statistics = {
    generatedAt: new Date().toISOString(),
    percentileMethod: dataset.percentileMethod,
    overall: statsFor(overallIntervals),
    byDao,
    topLongest,
  };
  writeCache(join(EVIDENCE_DIR, "statistics.json"), statistics);

  console.log("\n=== SUMMARY ===");
  console.log(`Included: ${allRecords.length} (Compound ${byDao.Compound.n}, Uniswap ${byDao.Uniswap.n})`);
  console.log(`Excluded: ${allExclusions.length}`, overallExclusionCounts);
  console.log(`mean=${(statistics.overall.mean! / 3600).toFixed(2)}h median=${(statistics.overall.median! / 60).toFixed(2)}m p90=${(statistics.overall.p90! / 3600).toFixed(2)}h max=${(statistics.overall.max! / 3600).toFixed(2)}h`);
  console.log("Wrote: evidence/historical/{historical-governor-fulfillment,exclusions,statistics}.json");
}

main().catch((err) => {
  console.error("GATE 8 REPRODUCTION FAILED:", err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
