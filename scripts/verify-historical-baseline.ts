/**
 * Gate 8 §30 — the INDEPENDENT verifier. Deliberately does not import
 * `reproduce-historical-baseline.ts` or its `lib/` helpers — it reads only
 * the committed, normalized `historical-governor-fulfillment.json` and
 * `statistics.json`, and recomputes every statistic with its own,
 * separately-written implementation. Agreement between this file's output
 * and the committed `statistics.json` is real evidence that the primary
 * aggregator isn't hiding a bug behind code both paths happen to share —
 * because there is no shared code here at all beyond "read this JSON file."
 *
 * Run with: pnpm verify:historical
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "evidence", "historical");

type Record_ = {
  dao: "Compound" | "Uniswap";
  proposalId: string;
  fulfillmentIntervalSeconds: number;
};

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// A freshly-written percentile function — same mathematical definition as
// the primary aggregator's (documented, versioned, both scripts must state
// it identically — see `percentileMethod` in the dataset itself), but typed
// out independently rather than imported.
function computePercentile(sortedAscending: number[], percentileRank: number): number | null {
  const count = sortedAscending.length;
  if (count === 0) return null;
  if (count === 1) return sortedAscending[0]!;
  const position = (percentileRank / 100) * (count - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  const lowerValue = sortedAscending[lowerIndex]!;
  const upperValue = sortedAscending[upperIndex]!;
  return lowerValue + fraction * (upperValue - lowerValue);
}

function computeMean(values: number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

// Boundary convention (must match the primary aggregator exactly, per Gate 8
// §15 "do not switch percentile algorithms between scripts", extended here
// to bucket boundaries too): the four sub-24h buckets are strict "<"; the
// three cumulative thresholds are strict ">" (an interval of exactly 86400s
// is not counted in ">24h").
function computeBuckets(values: number[]): Record<string, number> {
  const thresholds = { fiveMin: 300, oneHour: 3600, sixHours: 21600, oneDay: 86400, twoDays: 172800, sevenDays: 604800 };
  const out = { "<5m": 0, "5m-1h": 0, "1h-6h": 0, "6h-24h": 0, ">24h": 0, ">48h": 0, ">7d": 0 };
  for (const v of values) {
    if (v < thresholds.fiveMin) out["<5m"]++;
    else if (v < thresholds.oneHour) out["5m-1h"]++;
    else if (v < thresholds.sixHours) out["1h-6h"]++;
    else if (v < thresholds.oneDay) out["6h-24h"]++;

    if (v > thresholds.oneDay) out[">24h"]++;
    if (v > thresholds.twoDays) out[">48h"]++;
    if (v > thresholds.sevenDays) out[">7d"]++;
  }
  return out;
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: computeMean(sorted),
    median: computePercentile(sorted, 50),
    p75: computePercentile(sorted, 75),
    p90: computePercentile(sorted, 90),
    p95: computePercentile(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1]! : null,
    min: sorted.length ? sorted[0]! : null,
    buckets: computeBuckets(sorted),
  };
}

function roughlyEqual(a: number | null, b: number | null, epsilon = 1e-6): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= epsilon;
}

function main() {
  const dataset = loadJson<{ records: Record_[] }>(join(EVIDENCE_DIR, "historical-governor-fulfillment.json"));
  const committedStatistics = loadJson<{
    overall: ReturnType<typeof summarize>;
    byDao: Record<string, ReturnType<typeof summarize>>;
  }>(join(EVIDENCE_DIR, "statistics.json"));

  console.log("MARKED — GATE 8 INDEPENDENT VERIFIER");
  console.log(`Read ${dataset.records.length} records from historical-governor-fulfillment.json (no other file imported).\n`);

  const overallIntervals = dataset.records.map((r) => r.fulfillmentIntervalSeconds);
  const recomputedOverall = summarize(overallIntervals);

  const daoNames = [...new Set(dataset.records.map((r) => r.dao))].sort();
  const recomputedByDao: Record<string, ReturnType<typeof summarize>> = {};
  for (const dao of daoNames) {
    recomputedByDao[dao] = summarize(dataset.records.filter((r) => r.dao === dao).map((r) => r.fulfillmentIntervalSeconds));
  }

  let allMatch = true;
  function check(label: string, committed: number | null, recomputed: number | null) {
    const ok = roughlyEqual(committed, recomputed);
    if (!ok) allMatch = false;
    console.log(`  ${ok ? "MATCH" : "MISMATCH"}  ${label}: committed=${committed} recomputed=${recomputed}`);
  }

  console.log("Overall:");
  check("n", committedStatistics.overall.n, recomputedOverall.n);
  check("mean", committedStatistics.overall.mean, recomputedOverall.mean);
  check("median", committedStatistics.overall.median, recomputedOverall.median);
  check("p75", committedStatistics.overall.p75, recomputedOverall.p75);
  check("p90", committedStatistics.overall.p90, recomputedOverall.p90);
  check("p95", committedStatistics.overall.p95, recomputedOverall.p95);
  check("max", committedStatistics.overall.max, recomputedOverall.max);
  check("min", committedStatistics.overall.min, recomputedOverall.min);
  for (const bucket of Object.keys(recomputedOverall.buckets)) {
    check(`bucket ${bucket}`, committedStatistics.overall.buckets[bucket] ?? null, recomputedOverall.buckets[bucket] ?? null);
  }

  for (const dao of daoNames) {
    console.log(`\n${dao}:`);
    const committed = committedStatistics.byDao[dao];
    const recomputed = recomputedByDao[dao]!;
    if (!committed) {
      console.log(`  MISMATCH: no committed statistics found for ${dao}`);
      allMatch = false;
      continue;
    }
    check("n", committed.n, recomputed.n);
    check("mean", committed.mean, recomputed.mean);
    check("median", committed.median, recomputed.median);
    check("p90", committed.p90, recomputed.p90);
    check("max", committed.max, recomputed.max);
  }

  console.log(`\n=== ${allMatch ? "ALL STATISTICS MATCH — independent recomputation confirms the primary aggregator" : "MISMATCH DETECTED — see above"} ===`);
  if (!allMatch) process.exitCode = 1;
}

main();
