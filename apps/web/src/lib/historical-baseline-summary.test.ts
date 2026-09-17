import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HISTORICAL_BASELINE_SUMMARY } from "./historical-baseline-summary";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

type Statistics = {
  overall: { n: number; mean: number; median: number; p75: number; p90: number; p95: number; max: number; min: number; buckets: Record<string, number> };
  byDao: { Compound: { n: number }; Uniswap: { n: number } };
};

/**
 * Guards against the copied summary figures in historical-baseline-summary.ts
 * drifting from the committed evidence/historical/statistics.json — the
 * actual source of truth produced by `pnpm reproduce:historical`.
 */
describe("historical baseline summary matches committed evidence", () => {
  const statistics: Statistics = JSON.parse(readFileSync(join(REPO_ROOT, "evidence", "historical", "statistics.json"), "utf8"));
  const exclusions: { overall: Record<string, number> } = JSON.parse(readFileSync(join(REPO_ROOT, "evidence", "historical", "exclusions.json"), "utf8"));

  it("matches total and per-DAO included counts", () => {
    expect(HISTORICAL_BASELINE_SUMMARY.totalIncluded).toBe(statistics.overall.n);
    expect(HISTORICAL_BASELINE_SUMMARY.compoundIncluded).toBe(statistics.byDao.Compound.n);
    expect(HISTORICAL_BASELINE_SUMMARY.uniswapIncluded).toBe(statistics.byDao.Uniswap.n);
  });

  it("matches mean/median/p75/p90/p95/max/min within display rounding", () => {
    expect(HISTORICAL_BASELINE_SUMMARY.meanHours).toBeCloseTo(statistics.overall.mean / 3600, 1);
    expect(HISTORICAL_BASELINE_SUMMARY.medianMinutes).toBeCloseTo(statistics.overall.median / 60, 1);
    expect(HISTORICAL_BASELINE_SUMMARY.p75Hours).toBeCloseTo(statistics.overall.p75 / 3600, 1);
    expect(HISTORICAL_BASELINE_SUMMARY.p90Hours).toBeCloseTo(statistics.overall.p90 / 3600, 1);
    expect(HISTORICAL_BASELINE_SUMMARY.p95Hours).toBeCloseTo(statistics.overall.p95 / 3600, 1);
    expect(HISTORICAL_BASELINE_SUMMARY.maxHours).toBeCloseTo(statistics.overall.max / 3600, 1);
    expect(HISTORICAL_BASELINE_SUMMARY.minSeconds).toBe(statistics.overall.min);
  });

  it("matches every bucket count exactly", () => {
    expect(HISTORICAL_BASELINE_SUMMARY.buckets).toEqual(statistics.overall.buckets);
  });

  it("matches the total excluded count and the three observed exclusion reasons", () => {
    const totalExcluded = Object.values(exclusions.overall).reduce((a, b) => a + b, 0);
    expect(HISTORICAL_BASELINE_SUMMARY.totalExcluded).toBe(totalExcluded);
    expect(HISTORICAL_BASELINE_SUMMARY.exclusionCounts).toEqual(exclusions.overall);
  });
});
