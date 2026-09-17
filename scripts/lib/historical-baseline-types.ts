/**
 * Gate 8 — shared types for the PRIMARY reproduction pipeline only.
 * `scripts/verify-historical-baseline.ts` deliberately does NOT import
 * this file (or any code from `reproduce-historical-baseline.ts`) — per
 * instruction §30, the independent verifier reads only the committed
 * normalized JSON dataset and recomputes statistics with its own,
 * separately-written code, so agreement between the two is real evidence
 * of correctness rather than a shared bug reproducing itself.
 */

export type DaoName = "Compound" | "Uniswap";

export type ExclusionReason =
  | "MIGRATION_BOUNDARY"
  | "NOT_SUCCEEDED"
  | "NEVER_QUEUED"
  | "CANCELED"
  | "EXPIRED"
  | "QUEUED_AWAITING_EXECUTION"
  | "MISSING_CANONICAL_EVENT"
  | "RPC_DATA_UNAVAILABLE"
  | "NEGATIVE_INTERVAL_INVALID";

export type ExclusionRecord = {
  dao: DaoName;
  proposalId: string;
  reason: ExclusionReason;
  detail: string;
};

export type FulfillmentRecord = {
  dao: DaoName;
  proposalId: string;
  chainId: number;
  governor: string;
  family: "GOVERNOR_BRAVO";
  executionEligibleAt: number;
  executedAt: number;
  fulfillmentIntervalSeconds: number;
  queueTxHash: string | null;
  queueBlock: string | null;
  executionTxHash: string;
  executionBlock: string;
};

export type HistoricalDataset = {
  generatedAt: string;
  methodology: string;
  percentileMethod: string;
  records: FulfillmentRecord[];
};

export type ExclusionsFile = {
  generatedAt: string;
  byDao: Record<DaoName, Partial<Record<ExclusionReason, number>>>;
  overall: Partial<Record<ExclusionReason, number>>;
  records: ExclusionRecord[];
};
