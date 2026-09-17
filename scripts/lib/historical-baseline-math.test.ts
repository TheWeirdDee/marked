import { describe, expect, it } from "vitest";
import {
  percentile,
  mean,
  bucketize,
  statsFor,
  classifyProposalState,
  isMigrationBoundary,
  computeFulfillmentInterval,
  queuedEtaIsConsistent,
  sortRecordsDeterministically,
  computeTopLongest,
  findDuplicateKeys,
  groupByDao,
} from "./historical-baseline-math";

describe("computeFulfillmentInterval — the core Gate 8 metric", () => {
  it("computes eligibility from the Timelock eta, not proposal creation or queue time", () => {
    // executionEligibleAt here stands in for proposals().eta — the function
    // takes it as a raw input rather than deriving it from creation/queue
    // timestamps, which is the whole point of the timelock correction.
    const eta = 1_700_000_000;
    const executedAt = 1_700_000_500;
    const result = computeFulfillmentInterval(executedAt, eta);
    expect(result).toEqual({ ok: true, intervalSeconds: 500 });
  });

  it("returns a zero interval when execution happens exactly at eligibility", () => {
    const result = computeFulfillmentInterval(1_700_000_000, 1_700_000_000);
    expect(result).toEqual({ ok: true, intervalSeconds: 0 });
  });

  it("computes a normal positive interval when execution happens after eligibility", () => {
    const result = computeFulfillmentInterval(1_700_100_000, 1_700_000_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intervalSeconds).toBe(100_000);
  });

  it("flags a negative interval as NEGATIVE_INTERVAL_INVALID rather than silently including it", () => {
    const result = computeFulfillmentInterval(1_700_000_000, 1_700_000_500);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NEGATIVE_INTERVAL_INVALID");
  });
});

describe("queuedEtaIsConsistent — timelock eta cross-check", () => {
  it("passes when the ProposalQueued event's eta matches the current proposals().eta", () => {
    expect(queuedEtaIsConsistent(1_700_000_000n, 1_700_000_000n)).toBe(true);
  });

  it("fails when the ProposalQueued event's eta disagrees with the current proposals().eta", () => {
    expect(queuedEtaIsConsistent(1_700_000_000n, 1_700_000_999n)).toBe(false);
  });

  it("passes trivially when there is no queued log to cross-check against", () => {
    expect(queuedEtaIsConsistent(undefined, 1_700_000_000n)).toBe(true);
  });
});

describe("classifyProposalState — Governor Bravo state() -> inclusion/exclusion", () => {
  it("includes state 7 (Executed) as a timing data point", () => {
    expect(classifyProposalState(7, "Executed")).toEqual({ included: true });
  });

  it("excludes state 2 (Canceled) with reason CANCELED", () => {
    const result = classifyProposalState(2, "Canceled");
    expect(result).toEqual({ included: false, reason: "CANCELED", detail: "Governor state() reports Canceled." });
  });

  it("excludes state 6 (Expired) with reason EXPIRED", () => {
    const result = classifyProposalState(6, "Expired");
    expect(result.included).toBe(false);
    if (!result.included) expect(result.reason).toBe("EXPIRED");
  });

  it("excludes state 5 (Queued, awaiting execution) with reason QUEUED_AWAITING_EXECUTION", () => {
    const result = classifyProposalState(5, "Queued");
    expect(result.included).toBe(false);
    if (!result.included) expect(result.reason).toBe("QUEUED_AWAITING_EXECUTION");
  });

  it("excludes state 4 (Succeeded, never queued) with reason NEVER_QUEUED", () => {
    const result = classifyProposalState(4, "Succeeded");
    expect(result.included).toBe(false);
    if (!result.included) expect(result.reason).toBe("NEVER_QUEUED");
  });

  it.each([
    [0, "Pending"],
    [1, "Active"],
    [3, "Defeated"],
  ])("excludes state %i (%s) with reason NOT_SUCCEEDED", (state, label) => {
    const result = classifyProposalState(state, label);
    expect(result.included).toBe(false);
    if (!result.included) expect(result.reason).toBe("NOT_SUCCEEDED");
  });

  it("excludes an unrecognized state value with reason RPC_DATA_UNAVAILABLE rather than guessing", () => {
    const result = classifyProposalState(99, "Unknown");
    expect(result.included).toBe(false);
    if (!result.included) expect(result.reason).toBe("RPC_DATA_UNAVAILABLE");
  });
});

describe("isMigrationBoundary — proposal ids belonging to a prior Governor deployment", () => {
  it("treats ids at or below initialProposalId as belonging to the prior deployment (Compound: 42)", () => {
    expect(isMigrationBoundary(1n, 42n)).toBe(true);
    expect(isMigrationBoundary(42n, 42n)).toBe(true);
  });

  it("treats ids above initialProposalId as belonging to the current Bravo contract", () => {
    expect(isMigrationBoundary(43n, 42n)).toBe(false);
  });

  it("treats an initialProposalId of 0 as excluding nothing (no prior deployment)", () => {
    expect(isMigrationBoundary(1n, 0n)).toBe(false);
  });
});

describe("percentile — linear interpolation between closest ranks", () => {
  it("matches numpy's default np.percentile on a known dataset", () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentile(sorted, 50)).toBe(3);
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 100)).toBe(5);
    // rank = 0.25 * 4 = 1 -> exact index, no interpolation needed
    expect(percentile(sorted, 25)).toBe(2);
    // rank = 0.75 * 4 = 3 -> exact index
    expect(percentile(sorted, 75)).toBe(4);
  });

  it("interpolates between two values when the rank falls between indices", () => {
    const sorted = [10, 20];
    // rank = 0.5 * 1 = 0.5 -> halfway between 10 and 20
    expect(percentile(sorted, 50)).toBe(15);
  });

  it("returns the single value for a one-element dataset regardless of percentile", () => {
    expect(percentile([42], 90)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
  });

  it("returns NaN for an empty dataset rather than throwing", () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });
});

describe("mean", () => {
  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
});

describe("bucketize — boundary conventions", () => {
  it("places sub-24h values into mutually exclusive buckets via strict <", () => {
    const buckets = bucketize([299, 300, 3599, 3600, 21599, 21600, 86399]);
    // 299 -> <5m ; 300 -> 5m-1h (not <5m, since strict <) ; 3599 -> 5m-1h ; 3600 -> 1h-6h ; 21599 -> 1h-6h ; 21600 -> 6h-24h ; 86399 -> 6h-24h
    expect(buckets["<5m"]).toBe(1);
    expect(buckets["5m-1h"]).toBe(2);
    expect(buckets["1h-6h"]).toBe(2);
    expect(buckets["6h-24h"]).toBe(2);
  });

  it("does not count an interval of exactly 86400s (24h) in the >24h cumulative bucket", () => {
    const buckets = bucketize([86400]);
    expect(buckets[">24h"]).toBe(0);
    expect(buckets[">48h"]).toBe(0);
    expect(buckets[">7d"]).toBe(0);
  });

  it("counts an interval just over 24h in >24h only, not >48h or >7d", () => {
    const buckets = bucketize([86401]);
    expect(buckets[">24h"]).toBe(1);
    expect(buckets[">48h"]).toBe(0);
    expect(buckets[">7d"]).toBe(0);
  });

  it("treats >24h/>48h/>7d as cumulative (nested), not mutually exclusive", () => {
    const nineDays = 9 * 24 * 60 * 60;
    const buckets = bucketize([nineDays]);
    expect(buckets[">24h"]).toBe(1);
    expect(buckets[">48h"]).toBe(1);
    expect(buckets[">7d"]).toBe(1);
  });
});

describe("statsFor", () => {
  it("returns all-null stats for an empty dataset instead of throwing or returning NaN", () => {
    const stats = statsFor([]);
    expect(stats).toEqual({
      n: 0,
      mean: null,
      median: null,
      p75: null,
      p90: null,
      p95: null,
      max: null,
      min: null,
      buckets: { "<5m": 0, "5m-1h": 0, "1h-6h": 0, "6h-24h": 0, ">24h": 0, ">48h": 0, ">7d": 0 },
    });
  });

  it("sorts input before computing order-dependent statistics", () => {
    const stats = statsFor([500, 100, 300, 200, 400]);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(500);
    expect(stats.median).toBe(300);
  });
});

describe("sortRecordsDeterministically", () => {
  it("sorts by DAO name then numerically by proposal id, not lexicographically", () => {
    const records = [
      { dao: "Compound" as const, proposalId: "10" },
      { dao: "Compound" as const, proposalId: "2" },
      { dao: "Uniswap" as const, proposalId: "1" },
      { dao: "Compound" as const, proposalId: "1" },
    ];
    const sorted = sortRecordsDeterministically(records);
    expect(sorted.map((r) => `${r.dao}#${r.proposalId}`)).toEqual(["Compound#1", "Compound#2", "Compound#10", "Uniswap#1"]);
  });

  it("produces the same order regardless of input order (stability)", () => {
    const a = { dao: "Compound" as const, proposalId: "5" };
    const b = { dao: "Compound" as const, proposalId: "3" };
    const sorted1 = sortRecordsDeterministically([a, b]);
    const sorted2 = sortRecordsDeterministically([b, a]);
    expect(sorted1.map((r) => r.proposalId)).toEqual(sorted2.map((r) => r.proposalId));
    expect(sorted1.map((r) => r.proposalId)).toEqual(["3", "5"]);
  });
});

describe("computeTopLongest", () => {
  it("sorts descending by fulfillmentIntervalSeconds and slices to n", () => {
    const records = [
      { id: "a", fulfillmentIntervalSeconds: 100 },
      { id: "b", fulfillmentIntervalSeconds: 500 },
      { id: "c", fulfillmentIntervalSeconds: 300 },
    ];
    const top2 = computeTopLongest(records, 2);
    expect(top2.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("findDuplicateKeys — safety net against corrupted datasets", () => {
  it("finds no duplicates in a clean dataset", () => {
    const records = [
      { dao: "Compound" as const, proposalId: "1" },
      { dao: "Compound" as const, proposalId: "2" },
      { dao: "Uniswap" as const, proposalId: "1" },
    ];
    expect(findDuplicateKeys(records)).toEqual([]);
  });

  it("detects a duplicate (dao, proposalId) pair", () => {
    const records = [
      { dao: "Compound" as const, proposalId: "220" },
      { dao: "Compound" as const, proposalId: "220" },
    ];
    expect(findDuplicateKeys(records)).toEqual(["Compound#220"]);
  });

  it("does not confuse the same proposal id across different DAOs as a duplicate", () => {
    const records = [
      { dao: "Compound" as const, proposalId: "20" },
      { dao: "Uniswap" as const, proposalId: "20" },
    ];
    expect(findDuplicateKeys(records)).toEqual([]);
  });
});

describe("groupByDao", () => {
  it("groups records into separate Compound and Uniswap arrays", () => {
    const records = [
      { dao: "Compound" as const, v: 1 },
      { dao: "Uniswap" as const, v: 2 },
      { dao: "Compound" as const, v: 3 },
    ];
    const grouped = groupByDao(records);
    expect(grouped.Compound.map((r) => r.v)).toEqual([1, 3]);
    expect(grouped.Uniswap.map((r) => r.v)).toEqual([2]);
  });

  it("returns empty arrays for a DAO with no records rather than omitting the key", () => {
    const grouped = groupByDao([{ dao: "Compound" as const, v: 1 }]);
    expect(grouped.Uniswap).toEqual([]);
  });
});
