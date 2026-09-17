/**
 * Pure, dependency-free logic for the Gate 8 historical baseline pipeline —
 * extracted out of `reproduce-historical-baseline.ts` so it can be unit
 * tested without a live RPC. This is the SAME code the primary pipeline
 * imports and runs (see the import in reproduce-historical-baseline.ts), not
 * a duplicate written for tests — there is no drift risk between "the logic
 * that's tested" and "the logic that ships."
 *
 * `verify-historical-baseline.ts` (the independent verifier) deliberately
 * does NOT import from this file — see its own header comment. Its
 * percentile/mean/bucket functions are separately written on purpose.
 */
import type { DaoName, ExclusionReason } from "./historical-baseline-types";

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  const weight = rank - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const BUCKET_LABELS = ["<5m", "5m-1h", "1h-6h", "6h-24h", ">24h", ">48h", ">7d"] as const;

/**
 * `<5m`/`5m-1h`/`1h-6h`/`6h-24h` are mutually exclusive (they partition
 * [0, 24h)); `>24h`/`>48h`/`>7d` are cumulative thresholds (nested subsets
 * of each other). Boundary convention: sub-24h buckets use strict `<`,
 * cumulative buckets use strict `>` — an interval of exactly 86400s is not
 * counted in `>24h`. This convention must match verify-historical-baseline.ts
 * exactly even though the code is not shared (see evidence/historical/README.md).
 */
export function bucketize(values: number[]): Record<string, number> {
  const counts: Record<string, number> = { "<5m": 0, "5m-1h": 0, "1h-6h": 0, "6h-24h": 0, ">24h": 0, ">48h": 0, ">7d": 0 };
  for (const v of values) {
    if (v < 5 * 60) counts["<5m"]!++;
    else if (v < 60 * 60) counts["5m-1h"]!++;
    else if (v < 6 * 60 * 60) counts["1h-6h"]!++;
    else if (v < 24 * 60 * 60) counts["6h-24h"]!++;

    if (v > 24 * 60 * 60) counts[">24h"]!++;
    if (v > 48 * 60 * 60) counts[">48h"]!++;
    if (v > 7 * 24 * 60 * 60) counts[">7d"]!++;
  }
  return counts;
}

export function statsFor(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    mean: sorted.length ? mean(sorted) : null,
    median: sorted.length ? percentile(sorted, 50) : null,
    p75: sorted.length ? percentile(sorted, 75) : null,
    p90: sorted.length ? percentile(sorted, 90) : null,
    p95: sorted.length ? percentile(sorted, 95) : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
    min: sorted.length ? sorted[0] : null,
    buckets: bucketize(sorted),
  };
}

/**
 * Governor Bravo `state()` enum: 0 Pending, 1 Active, 2 Canceled,
 * 3 Defeated, 4 Succeeded, 5 Queued, 6 Expired, 7 Executed. Maps a raw
 * state value to either "this proposal is a timing data point" or a
 * specific, documented exclusion reason — never a silent drop.
 */
export type StateClassification = { included: true } | { included: false; reason: ExclusionReason; detail: string };

export function classifyProposalState(state: number, stateLabel: string): StateClassification {
  switch (state) {
    case 7:
      return { included: true };
    case 2:
      return { included: false, reason: "CANCELED", detail: "Governor state() reports Canceled." };
    case 6:
      return { included: false, reason: "EXPIRED", detail: "Governor state() reports Expired — queued but never executed within the Timelock grace period." };
    case 5:
      return { included: false, reason: "QUEUED_AWAITING_EXECUTION", detail: "Governor state() reports Queued — currently executable but not yet executed as of data collection." };
    case 4:
      return { included: false, reason: "NEVER_QUEUED", detail: "Governor state() reports Succeeded — passed voting but queue() was never called." };
    case 0:
    case 1:
    case 3:
      return { included: false, reason: "NOT_SUCCEEDED", detail: `Governor state() reports ${stateLabel} — never passed voting.` };
    default:
      return { included: false, reason: "RPC_DATA_UNAVAILABLE", detail: `Unrecognized state value ${state}.` };
  }
}

/** True when a proposal id predates the current Bravo contract's own numbering (see evidence/historical/README.md "migration boundary"). */
export function isMigrationBoundary(id: bigint, initialProposalId: bigint): boolean {
  return id <= initialProposalId;
}

export type IntervalResult = { ok: true; intervalSeconds: number } | { ok: false; reason: "NEGATIVE_INTERVAL_INVALID"; detail: string };

/**
 * The core Gate 8 metric. `executionEligibleAt` MUST be the Timelock eta,
 * not proposal creation and not queue-transaction time — that exclusion of
 * the mandatory voting/timelock delay is the entire point of this function
 * (Gate 8 §9's "timelock correction").
 */
export function computeFulfillmentInterval(executedAt: number, executionEligibleAt: number): IntervalResult {
  const intervalSeconds = executedAt - executionEligibleAt;
  if (intervalSeconds < 0) {
    return { ok: false, reason: "NEGATIVE_INTERVAL_INVALID", detail: `executedAt (${executedAt}) precedes executionEligibleAt (${executionEligibleAt}) — a data anomaly, excluded rather than silently included.` };
  }
  return { ok: true, intervalSeconds };
}

/**
 * `eta` is immutable once a proposal is queued — the `ProposalQueued` event's
 * `eta` argument and the contract's current `proposals(id).eta` must always
 * agree for a valid record. A mismatch signals a data problem worth
 * excluding rather than trusting either value blindly.
 */
export function queuedEtaIsConsistent(queuedLogEta: bigint | undefined, currentEta: bigint): boolean {
  if (queuedLogEta === undefined) return true; // no queued log found — nothing to cross-check, not a failure by itself
  return queuedLogEta === currentEta;
}

type MinimalRecord = { dao: DaoName; proposalId: string };

/** Deterministic ordering: by DAO name, then numerically by proposal id (not lexicographically — "10" must not sort before "2"). */
export function sortRecordsDeterministically<T extends MinimalRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => (a.dao === b.dao ? Number(BigInt(a.proposalId) - BigInt(b.proposalId)) : a.dao.localeCompare(b.dao)));
}

export function computeTopLongest<T extends { fulfillmentIntervalSeconds: number }>(records: T[], n: number): T[] {
  return [...records].sort((a, b) => b.fulfillmentIntervalSeconds - a.fulfillmentIntervalSeconds).slice(0, n);
}

/** Safety-net check: the pipeline's id-range generation can't naturally produce duplicates, but the final dataset should never silently contain two records for the same (dao, proposalId). */
export function findDuplicateKeys<T extends MinimalRecord>(records: T[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const r of records) {
    const key = `${r.dao}#${r.proposalId}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

export function groupByDao<T extends { dao: DaoName }>(records: T[]): Record<DaoName, T[]> {
  const out: Record<DaoName, T[]> = { Compound: [], Uniswap: [] };
  for (const r of records) out[r.dao].push(r);
  return out;
}
