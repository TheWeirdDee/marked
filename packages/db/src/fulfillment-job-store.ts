import type { FulfillmentJob, FulfillmentJobEvent, FulfillmentJobId, FulfillmentStatus } from "@marked/core";

/**
 * Gate 4 persistence boundary for the two tables this gate needs —
 * `fulfillment_jobs` and `job_events` — from the planned table list in
 * `packages/db/README.md`. The other planned tables
 * (`governance_objects`, `authorizations`, `keeperhub_runs`,
 * `postcondition_checks`, `receipts`) remain `NOT_IMPLEMENTED`; this file
 * does not touch them.
 *
 * `FulfillmentJobStore` is a real interface, not a placeholder — Gate 11's
 * `PostgresFulfillmentJobStore` satisfies the exact same contract as Gate 7's
 * `SqliteFulfillmentJobStore`. `InMemoryFulfillmentJobStore` remains the
 * deterministic reference implementation used by pure-logic tests.
 *
 * Gate 11 addition: `tryClaimExecution`/`getExecutionClaim`/`close` were
 * previously `SqliteFulfillmentJobStore`-only members, which meant every
 * caller of them had to depend on that concrete class rather than this
 * interface. They are promoted onto the interface here (additive — the
 * original five methods are unchanged) precisely so business logic can
 * depend on the abstraction, matching Gate 11 §3. `saveJobAndEvents` and
 * `saveWithCas` are new: the former closes a real durability gap (a job
 * save and its event append were two separate calls with no atomicity
 * guarantee between them — see `evidence/production-persistence/atomicity.md`);
 * the latter gives the job table itself a real compare-and-set path,
 * proven in `evidence/production-persistence/atomicity.md`, in addition to
 * the execution-claim CAS Gate 7 already proved.
 */
export interface FulfillmentJobStore {
  save(job: FulfillmentJob): Promise<void>;
  get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null>;
  /** Append-only — there is deliberately no `updateEvents`/`deleteEvents` method anywhere in this interface. Corrections append a new event; nothing already persisted is ever rewritten (BUILD_CONTRACT.md, PRD §14). */
  appendEvents(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void>;
  getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]>;
  /** Gate 9R — the application dashboard needs to list known jobs. Read-only, most-recently-updated first. */
  listJobs(): Promise<readonly FulfillmentJob[]>;

  /**
   * Gate 11 — saves the job and appends its events as ONE atomic operation.
   * Must never leave the store in a state where the job changed but its
   * event append failed, or vice versa (Gate 11 §7). Prefer this over
   * calling `save` then `appendEvents` separately for any state transition
   * that has a corresponding event.
   */
  saveJobAndEvents(job: FulfillmentJob, events: readonly FulfillmentJobEvent[]): Promise<void>;

  /**
   * Gate 11 — compare-and-set on the job's currently-stored status.
   * `expectedCurrentStatus` must match what is actually stored right now
   * (or be `null`, meaning "the job must not already exist") for the write
   * to apply; otherwise no write happens and `ok: false` is returned with
   * the real current status, never silently overwritten. Also appends
   * `events` atomically with the job write, like `saveJobAndEvents`.
   */
  saveWithCas(job: FulfillmentJob, events: readonly FulfillmentJobEvent[], expectedCurrentStatus: FulfillmentStatus | null): Promise<CasSaveResult>;

  /**
   * Gate 7's duplicate-worker protection, promoted onto the interface.
   * `requestHash` is a caller-computed deterministic identity for "this
   * specific execution attempt" — the first caller to claim a given hash
   * gets `claimed: true`; every subsequent caller for the same hash gets
   * `claimed: false` with the job id that already holds it. Must be a real
   * storage-level unique-constraint compare-and-set, never a
   * read-then-write race (Gate 11 §6).
   */
  tryClaimExecution(requestHash: string, jobId: string, actor: string): Promise<ExecutionClaimResult>;
  getExecutionClaim(requestHash: string): Promise<ExecutionClaim | null>;

  /** Releases any held connection/handle. Idempotent-safe to call more than once. */
  close(): Promise<void>;
}

export type ExecutionClaimResult = { claimed: boolean; existingClaimJobId?: string | undefined };
export type ExecutionClaim = { jobId: string; actor: string; claimedAt: string };
export type CasSaveResult = { ok: true } | { ok: false; reason: "REVISION_CONFLICT"; actualStatus: FulfillmentStatus | null };

export type FulfillmentJobStoreSnapshot = {
  jobs: Record<FulfillmentJobId, FulfillmentJob>;
  events: Record<FulfillmentJobId, readonly FulfillmentJobEvent[]>;
};

/**
 * Deterministic in-memory reference implementation. `exportSnapshot()` /
 * `fromSnapshot()` exist specifically to prove "state recovery after
 * process restart must not lose the frozen commitment" (instructions §10)
 * without requiring an actual OS process restart or a real database in
 * this gate's test suite — a snapshot round-trip into a brand-new instance
 * is the standard way to prove a persistence interface survives a restart,
 * and any real backing store must satisfy the same round-trip property.
 */
export class InMemoryFulfillmentJobStore implements FulfillmentJobStore {
  private readonly jobs = new Map<FulfillmentJobId, FulfillmentJob>();
  private readonly events = new Map<FulfillmentJobId, FulfillmentJobEvent[]>();
  private readonly claims = new Map<string, ExecutionClaim>();

  async save(job: FulfillmentJob): Promise<void> {
    this.jobs.set(job.jobId, job);
    if (!this.events.has(job.jobId)) this.events.set(job.jobId, []);
  }

  async get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async appendEvents(jobId: FulfillmentJobId, newEvents: readonly FulfillmentJobEvent[]): Promise<void> {
    const existing = this.events.get(jobId) ?? [];
    this.events.set(jobId, [...existing, ...newEvents]);
  }

  async getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]> {
    return this.events.get(jobId) ?? [];
  }

  async listJobs(): Promise<readonly FulfillmentJob[]> {
    return [...this.jobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveJobAndEvents(job: FulfillmentJob, events: readonly FulfillmentJobEvent[]): Promise<void> {
    await this.save(job);
    await this.appendEvents(job.jobId, events);
  }

  async saveWithCas(job: FulfillmentJob, events: readonly FulfillmentJobEvent[], expectedCurrentStatus: FulfillmentStatus | null): Promise<CasSaveResult> {
    const current = this.jobs.get(job.jobId) ?? null;
    const currentStatus = current?.status ?? null;
    if (currentStatus !== expectedCurrentStatus) {
      return { ok: false, reason: "REVISION_CONFLICT", actualStatus: currentStatus };
    }
    await this.saveJobAndEvents(job, events);
    return { ok: true };
  }

  async tryClaimExecution(requestHash: string, jobId: string, actor: string): Promise<ExecutionClaimResult> {
    const existing = this.claims.get(requestHash);
    if (existing) return { claimed: false, existingClaimJobId: existing.jobId };
    this.claims.set(requestHash, { jobId, actor, claimedAt: new Date().toISOString() });
    return { claimed: true };
  }

  async getExecutionClaim(requestHash: string): Promise<ExecutionClaim | null> {
    return this.claims.get(requestHash) ?? null;
  }

  async close(): Promise<void> {
    // No handle to release — nothing to do.
  }

  exportSnapshot(): FulfillmentJobStoreSnapshot {
    return {
      jobs: Object.fromEntries(this.jobs),
      events: Object.fromEntries(this.events),
    };
  }

  static fromSnapshot(snapshot: FulfillmentJobStoreSnapshot): InMemoryFulfillmentJobStore {
    const store = new InMemoryFulfillmentJobStore();
    for (const [jobId, job] of Object.entries(snapshot.jobs)) store.jobs.set(jobId, job);
    for (const [jobId, events] of Object.entries(snapshot.events)) store.events.set(jobId, [...events]);
    return store;
  }
}
