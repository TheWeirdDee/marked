import { DatabaseSync } from "node:sqlite";
import type { FulfillmentJob, FulfillmentJobEvent, FulfillmentJobId, FulfillmentStatus } from "@marked/core";
import type { CasSaveResult, ExecutionClaim, ExecutionClaimResult, FulfillmentJobStore } from "./fulfillment-job-store";

/**
 * Gate 7 — the "smallest credible durable implementation" (instructions
 * Part 17): a real, file-backed, transactional SQLite database using
 * Node's own built-in `node:sqlite` module — zero new npm dependencies,
 * real ACID guarantees, real survival across process restart.
 *
 * Honesty boundary, stated once here rather than re-litigated at every call
 * site: `node:sqlite` is an experimental Node.js API (stable since no
 * Node LTS as of this writing), and this is a single-file, single-process
 * database — there is no replication, no multi-region durability, no
 * connection pooling. It is a genuine upgrade over Gate 4's
 * `InMemoryFulfillmentJobStore` (survives restart; that one does not) and a
 * real demonstration that the `FulfillmentJobStore` interface can be
 * satisfied by an actual database — it is not, and is never claimed to be,
 * production-grade distributed infrastructure. See
 * `evidence/recovery-hardening/persistence.md`.
 *
 * Gate 11: this remains the local/test store — see `job-store.ts`'s driver
 * selection and `PostgresFulfillmentJobStore` for the production store.
 * Adds a `revision` column (for `saveWithCas`) and wraps job+event writes
 * in a real SQLite transaction (`saveJobAndEvents`); the five original
 * methods' on-disk shape and behavior are unchanged, so no existing
 * `.sqlite` file or test fixture is invalidated by this gate.
 */
export class SqliteFulfillmentJobStore implements FulfillmentJobStore {
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fulfillment_jobs (
        job_id TEXT PRIMARY KEY,
        job_json TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id, seq);
      CREATE TABLE IF NOT EXISTS execution_claims (
        request_hash TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        claimed_at TEXT NOT NULL
      );
    `);
    // Gate 11 migration for a database file created before the `status`/`revision` columns existed (Gate 7 fixtures, if any survive on disk).
    const cols = this.db.prepare("PRAGMA table_info(fulfillment_jobs)").all().map((r) => r["name"] as string);
    if (!cols.includes("status")) this.db.exec("ALTER TABLE fulfillment_jobs ADD COLUMN status TEXT NOT NULL DEFAULT ''");
    if (!cols.includes("revision")) this.db.exec("ALTER TABLE fulfillment_jobs ADD COLUMN revision INTEGER NOT NULL DEFAULT 0");
  }

  async save(job: FulfillmentJob): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO fulfillment_jobs (job_id, job_json, status, revision, updated_at) VALUES (?, ?, ?, 0, ?)
                 ON CONFLICT(job_id) DO UPDATE SET job_json = excluded.job_json, status = excluded.status, revision = fulfillment_jobs.revision + 1, updated_at = excluded.updated_at`,
      )
      .run(job.jobId, JSON.stringify(job), job.status, job.updatedAt);
  }

  async get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null> {
    const row = this.db.prepare("SELECT job_json FROM fulfillment_jobs WHERE job_id = ?").get(jobId);
    if (!row) return null;
    return JSON.parse(row["job_json"] as string) as FulfillmentJob;
  }

  /** Append-only — there is deliberately no UPDATE/DELETE statement anywhere in this class for job_events. */
  async appendEvents(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void> {
    this.appendEventsSync(jobId, events);
  }

  private appendEventsSync(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): void {
    const existing = this.db.prepare("SELECT COALESCE(MAX(seq), -1) AS maxSeq FROM job_events WHERE job_id = ?").get(jobId);
    let nextSeq = Number(existing?.["maxSeq"] ?? -1) + 1;
    const insert = this.db.prepare("INSERT INTO job_events (job_id, seq, event_json) VALUES (?, ?, ?)");
    for (const event of events) {
      insert.run(jobId, nextSeq, JSON.stringify(event));
      nextSeq += 1;
    }
  }

  async getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]> {
    const rows = this.db.prepare("SELECT event_json FROM job_events WHERE job_id = ? ORDER BY seq ASC").all(jobId);
    return rows.map((r) => JSON.parse(r["event_json"] as string) as FulfillmentJobEvent);
  }

  async listJobs(): Promise<readonly FulfillmentJob[]> {
    const rows = this.db.prepare("SELECT job_json FROM fulfillment_jobs ORDER BY updated_at DESC").all();
    return rows.map((r) => JSON.parse(r["job_json"] as string) as FulfillmentJob);
  }

  /** Gate 11 §7 — one real SQLite transaction for the job write and its event append, so a crash between the two can never leave one persisted without the other. */
  async saveJobAndEvents(job: FulfillmentJob, events: readonly FulfillmentJobEvent[]): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO fulfillment_jobs (job_id, job_json, status, revision, updated_at) VALUES (?, ?, ?, 0, ?)
                   ON CONFLICT(job_id) DO UPDATE SET job_json = excluded.job_json, status = excluded.status, revision = fulfillment_jobs.revision + 1, updated_at = excluded.updated_at`,
        )
        .run(job.jobId, JSON.stringify(job), job.status, job.updatedAt);
      this.appendEventsSync(job.jobId, events);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Gate 11 §6 — compare-and-set on the currently-stored status, in the same transaction as the write. */
  async saveWithCas(job: FulfillmentJob, events: readonly FulfillmentJobEvent[], expectedCurrentStatus: FulfillmentStatus | null): Promise<CasSaveResult> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT status FROM fulfillment_jobs WHERE job_id = ?").get(job.jobId);
      const actualStatus = (row?.["status"] as FulfillmentStatus | undefined) ?? null;
      if (actualStatus !== expectedCurrentStatus) {
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "REVISION_CONFLICT", actualStatus };
      }
      this.db
        .prepare(
          `INSERT INTO fulfillment_jobs (job_id, job_json, status, revision, updated_at) VALUES (?, ?, ?, 0, ?)
                   ON CONFLICT(job_id) DO UPDATE SET job_json = excluded.job_json, status = excluded.status, revision = fulfillment_jobs.revision + 1, updated_at = excluded.updated_at`,
        )
        .run(job.jobId, JSON.stringify(job), job.status, job.updatedAt);
      this.appendEventsSync(job.jobId, events);
      this.db.exec("COMMIT");
      return { ok: true };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * Gate 7 Part 16.I — duplicate-worker protection via a real database
   * compare-and-set: `request_hash` is the table's `PRIMARY KEY`, so a
   * second worker's `INSERT` for the same request hash fails with a
   * constraint violation, which this method turns into `claimed: false`
   * rather than letting the exception propagate. Only the worker that
   * successfully inserts may proceed to call KeeperHub.
   */
  async tryClaimExecution(requestHash: string, jobId: string, actor: string): Promise<ExecutionClaimResult> {
    try {
      this.db.prepare("INSERT INTO execution_claims (request_hash, job_id, actor, claimed_at) VALUES (?, ?, ?, ?)").run(requestHash, jobId, actor, new Date().toISOString());
      return { claimed: true };
    } catch {
      const existing = this.db.prepare("SELECT job_id FROM execution_claims WHERE request_hash = ?").get(requestHash);
      return { claimed: false, existingClaimJobId: existing ? (existing["job_id"] as string) : undefined };
    }
  }

  async getExecutionClaim(requestHash: string): Promise<ExecutionClaim | null> {
    const row = this.db.prepare("SELECT job_id, actor, claimed_at FROM execution_claims WHERE request_hash = ?").get(requestHash);
    if (!row) return null;
    return { jobId: row["job_id"] as string, actor: row["actor"] as string, claimedAt: row["claimed_at"] as string };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
