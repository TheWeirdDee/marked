-- Gate 11 — initial production schema for FulfillmentJobStore.
--
-- Mirrors packages/db/src/sqlite-fulfillment-job-store.ts's table shape
-- exactly: the canonical job and event are stored as JSONB blobs, never
-- decomposed into lossy typed columns (Gate 11 §5 — "do not casually
-- normalize cryptographic evidence"). The few plain columns
-- (status, revision, updated_at) exist only to support querying/sorting
-- and the compare-and-set path; they are derived from the JSON, not an
-- alternate source of truth for it.
--
-- Applied by `packages/db/src/migrate.ts` (pnpm db:migrate). Safe to run
-- more than once — every statement is guarded with IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS fulfillment_jobs (
  job_id TEXT PRIMARY KEY,
  job_json JSONB NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events (job_id, seq);

-- Gate 7's duplicate-worker protection, promoted to a shared table shape:
-- request_hash as the PRIMARY KEY is what makes tryClaimExecution() a real
-- storage-level compare-and-set rather than an application-level race
-- check (Gate 11 §6).
CREATE TABLE IF NOT EXISTS execution_claims (
  request_hash TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
