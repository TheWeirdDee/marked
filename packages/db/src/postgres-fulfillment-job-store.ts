import postgres, { type ISql, type Sql } from "postgres";
import type { FulfillmentJob, FulfillmentJobEvent, FulfillmentJobId, FulfillmentStatus } from "@marked/core";
import type { CasSaveResult, ExecutionClaim, ExecutionClaimResult, FulfillmentJobStore } from "./fulfillment-job-store";
import { PersistenceConfigurationError, PersistenceUnavailableError } from "./errors";

/** A plain JSON round-trip guarantees the value structurally satisfies porsager/postgres's `JSONValue` type — every field of `FulfillmentJob`/`FulfillmentJobEvent` is already plain string/number/boolean/nested-object data (see evidence/production-persistence/current-storage-audit.md §5), so this is lossless, not a lossy normalization. */
function toJsonValue<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Gate 11 — the production `FulfillmentJobStore` implementation, backed by
 * a real PostgreSQL database via `postgres` (porsager/postgres): a
 * minimal, zero-dependency, actively-maintained driver — not an ORM, not
 * vendor-locked to any specific hosting provider. Works against any
 * standard Postgres (Neon, a self-hosted instance, etc.).
 *
 * Schema lives in `packages/db/migrations/` and is applied via
 * `pnpm db:migrate` — this class never runs DDL itself (Gate 11 §8: no
 * schema-on-first-request, no destructive startup behavior).
 *
 * Connection handling (Gate 11 §22): one `postgres()` client per store
 * instance, `max: 1` — a single pooled connection reused across every
 * query this instance makes. In a Vercel serverless function, each store
 * instance corresponds to one warm function instance; `max: 1` avoids
 * opening a new TCP+TLS connection per request while never exceeding a
 * single connection per concurrent invocation of that function instance
 * (Postgres connection limits are a real constraint under serverless
 * fan-out — this is the standard porsager/postgres recommendation for
 * that environment). `ssl: "require"` matches every current hosted
 * Postgres provider's default expectation (Neon included).
 */
export class PostgresFulfillmentJobStore implements FulfillmentJobStore {
  private readonly sql: Sql;

  constructor(connectionString: string) {
    try {
      this.sql = postgres(connectionString, {
        max: 1,
        ssl: "require",
        connect_timeout: 10,
        // Fails fast with a typed error rather than hanging a serverless invocation past its own timeout.
        onnotice: () => {
          /* suppress routine NOTICE spam (e.g. IF NOT EXISTS no-ops during migration) — never logs query parameters */
        },
      });
    } catch (err) {
      // Gate 12 hostile audit: a malformed connection string (not merely an
      // unreachable one) makes `postgres()` itself throw synchronously — a
      // plain, generic `TypeError: Invalid URL` from the driver, previously
      // uncaught here, which would propagate past this class's typed error
      // taxonomy entirely. Never includes the connection string in the
      // message (the driver's own "Invalid URL" message does not either).
      throw new PersistenceConfigurationError(`DATABASE_URL is not a valid Postgres connection string (${err instanceof Error ? err.message : String(err)}).`);
    }
  }

  private wrapConnectionError(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err);
    // porsager/postgres surfaces connection failures with these codes/messages — never includes the connection string itself.
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection terminated|connect_timeout|password authentication failed/i.test(message)) {
      throw new PersistenceUnavailableError("postgres", err);
    }
    throw err;
  }

  async save(job: FulfillmentJob): Promise<void> {
    try {
      await this.sql`
        INSERT INTO fulfillment_jobs (job_id, job_json, status, revision, updated_at)
        VALUES (${job.jobId}, ${this.sql.json(toJsonValue(job) as postgres.JSONValue)}, ${job.status}, 0, ${job.updatedAt})
        ON CONFLICT (job_id) DO UPDATE SET
          job_json = excluded.job_json,
          status = excluded.status,
          revision = fulfillment_jobs.revision + 1,
          updated_at = excluded.updated_at
      `;
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  async get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null> {
    try {
      const rows = await this.sql<{ job_json: FulfillmentJob }[]>`SELECT job_json FROM fulfillment_jobs WHERE job_id = ${jobId}`;
      return rows[0]?.job_json ?? null;
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  async appendEvents(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void> {
    try {
      await this.appendEventsTx(this.sql, jobId, events);
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  private async appendEventsTx(tx: ISql, jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows = await tx<{ maxSeq: number | null }[]>`SELECT MAX(seq) AS "maxSeq" FROM job_events WHERE job_id = ${jobId}`;
    let nextSeq = (rows[0]?.maxSeq ?? -1) + 1;
    for (const event of events) {
      await tx`INSERT INTO job_events (job_id, seq, event_json) VALUES (${jobId}, ${nextSeq}, ${tx.json(toJsonValue(event) as postgres.JSONValue)})`;
      nextSeq += 1;
    }
  }

  async getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]> {
    try {
      const rows = await this.sql<{ event_json: FulfillmentJobEvent }[]>`SELECT event_json FROM job_events WHERE job_id = ${jobId} ORDER BY seq ASC`;
      return rows.map((r) => r.event_json);
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  async listJobs(): Promise<readonly FulfillmentJob[]> {
    try {
      const rows = await this.sql<{ job_json: FulfillmentJob }[]>`SELECT job_json FROM fulfillment_jobs ORDER BY updated_at DESC`;
      return rows.map((r) => r.job_json);
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  /** Gate 11 §7 — one real Postgres transaction for the job write and its event append. */
  async saveJobAndEvents(job: FulfillmentJob, events: readonly FulfillmentJobEvent[]): Promise<void> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`
          INSERT INTO fulfillment_jobs (job_id, job_json, status, revision, updated_at)
          VALUES (${job.jobId}, ${tx.json(toJsonValue(job) as postgres.JSONValue)}, ${job.status}, 0, ${job.updatedAt})
          ON CONFLICT (job_id) DO UPDATE SET
            job_json = excluded.job_json,
            status = excluded.status,
            revision = fulfillment_jobs.revision + 1,
            updated_at = excluded.updated_at
        `;
        await this.appendEventsTx(tx, job.jobId, events);
      });
    } catch (err) {
      if (err instanceof PersistenceUnavailableError) throw err;
      this.wrapConnectionError(err);
    }
  }

  /**
   * Gate 11 §6 — compare-and-set on the job's currently-stored status.
   * Uses a single atomic `UPDATE ... WHERE status = expected` (or
   * `INSERT ... ON CONFLICT DO NOTHING` when `expectedCurrentStatus` is
   * `null`) so the check-and-write is one indivisible statement — Postgres
   * itself, not application code, is what makes two concurrent callers
   * resolve to exactly one winner.
   */
  async saveWithCas(job: FulfillmentJob, events: readonly FulfillmentJobEvent[], expectedCurrentStatus: FulfillmentStatus | null): Promise<CasSaveResult> {
    try {
      return await this.sql.begin(async (tx) => {
        let wonRow: { job_id: string }[];
        if (expectedCurrentStatus === null) {
          wonRow = await tx<{ job_id: string }[]>`
            INSERT INTO fulfillment_jobs (job_id, job_json, status, revision, updated_at)
            VALUES (${job.jobId}, ${tx.json(toJsonValue(job) as postgres.JSONValue)}, ${job.status}, 0, ${job.updatedAt})
            ON CONFLICT (job_id) DO NOTHING
            RETURNING job_id
          `;
        } else {
          wonRow = await tx<{ job_id: string }[]>`
            UPDATE fulfillment_jobs
            SET job_json = ${tx.json(toJsonValue(job) as postgres.JSONValue)}, status = ${job.status}, revision = revision + 1, updated_at = ${job.updatedAt}
            WHERE job_id = ${job.jobId} AND status = ${expectedCurrentStatus}
            RETURNING job_id
          `;
        }

        if (wonRow.length === 0) {
          const existing = await tx<{ status: FulfillmentStatus }[]>`SELECT status FROM fulfillment_jobs WHERE job_id = ${job.jobId}`;
          return { ok: false, reason: "REVISION_CONFLICT", actualStatus: existing[0]?.status ?? null } as CasSaveResult;
        }

        await this.appendEventsTx(tx, job.jobId, events);
        return { ok: true } as CasSaveResult;
      });
    } catch (err) {
      if (err instanceof PersistenceUnavailableError) throw err;
      this.wrapConnectionError(err);
    }
  }

  /** Gate 7's duplicate-worker protection — `request_hash` is the table's PRIMARY KEY, so `ON CONFLICT DO NOTHING` is a real storage-level compare-and-set, not an application-level race check. */
  async tryClaimExecution(requestHash: string, jobId: string, actor: string): Promise<ExecutionClaimResult> {
    try {
      const won = await this.sql<{ request_hash: string }[]>`
        INSERT INTO execution_claims (request_hash, job_id, actor, claimed_at)
        VALUES (${requestHash}, ${jobId}, ${actor}, ${new Date().toISOString()})
        ON CONFLICT (request_hash) DO NOTHING
        RETURNING request_hash
      `;
      if (won.length > 0) return { claimed: true };
      const existing = await this.sql<{ job_id: string }[]>`SELECT job_id FROM execution_claims WHERE request_hash = ${requestHash}`;
      return { claimed: false, existingClaimJobId: existing[0]?.job_id };
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  async getExecutionClaim(requestHash: string): Promise<ExecutionClaim | null> {
    try {
      const rows = await this.sql<{ job_id: string; actor: string; claimed_at: string }[]>`
        SELECT job_id, actor, claimed_at FROM execution_claims WHERE request_hash = ${requestHash}
      `;
      const row = rows[0];
      if (!row) return null;
      return { jobId: row.job_id, actor: row.actor, claimedAt: row.claimed_at };
    } catch (err) {
      this.wrapConnectionError(err);
    }
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
