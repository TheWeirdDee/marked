/**
 * Gate 8 summary figures for the evidence and landing pages.
 *
 * Source of truth is evidence/historical/statistics.json, produced by
 * `pnpm reproduce:historical` and independently confirmed by
 * `pnpm verify:historical`. These are copied here (not imported directly)
 * because the web app only bundles files under apps/web. If the dataset is
 * ever regenerated, update these figures to match — do not let this file
 * drift from the committed JSON.
 */
export const HISTORICAL_BASELINE_SUMMARY = {
  totalIncluded: 353,
  compoundIncluded: 281,
  uniswapIncluded: 72,
  totalExcluded: 140,
  meanHours: 6.3,
  medianMinutes: 2.2,
  p75Hours: 1.56,
  p90Hours: 12.96,
  p95Hours: 38.03,
  maxHours: 231.14,
  minSeconds: 12,
  buckets: {
    "<5m": 221,
    "5m-1h": 34,
    "1h-6h": 40,
    "6h-24h": 36,
    ">24h": 22,
    ">48h": 14,
    ">7d": 2,
  },
  longestCase: {
    dao: "Uniswap",
    proposalId: 20,
    hours: 231.14,
    days: 9.63,
  },
  secondLongestCase: {
    dao: "Compound",
    proposalId: 220,
    hours: 106.06,
    days: 4.42,
  },
  exclusionCounts: {
    MIGRATION_BOUNDARY: 50,
    CANCELED: 53,
    NOT_SUCCEEDED: 37,
  },
} as const;
