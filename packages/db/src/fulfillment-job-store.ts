import type { FulfillmentJob, FulfillmentJobEvent, FulfillmentJobId } from "@marked/core";

/**
 * Gate 4 persistence boundary for the two tables this gate needs —
 * `fulfillment_jobs` and `job_events` — from the planned table list in
 * `packages/db/README.md`. The other planned tables
 * (`governance_objects`, `authorizations`, `keeperhub_runs`,
 * `postcondition_checks`, `receipts`) remain `NOT_IMPLEMENTED`; this file
 * does not touch them.
 *
 * `FulfillmentJobStore` is a real interface, not a placeholder — a future
 * Drizzle/PostgreSQL implementation satisfies the exact same contract.
 * `InMemoryFulfillmentJobStore` is the deterministic reference
 * implementation used until then (instructions §10: "Do not require a
 * production hosted database... but the storage interface must be real and
 * deterministic").
 */
export interface FulfillmentJobStore {
  save(job: FulfillmentJob): Promise<void>;
  get(jobId: FulfillmentJobId): Promise<FulfillmentJob | null>;
  /** Append-only — there is deliberately no `updateEvents`/`deleteEvents` method anywhere in this interface. Corrections append a new event; nothing already persisted is ever rewritten (BUILD_CONTRACT.md, PRD §14). */
  appendEvents(jobId: FulfillmentJobId, events: readonly FulfillmentJobEvent[]): Promise<void>;
  getEvents(jobId: FulfillmentJobId): Promise<readonly FulfillmentJobEvent[]>;
  /** Gate 9R — the application dashboard needs to list known jobs. Read-only, most-recently-updated first. */
  listJobs(): Promise<readonly FulfillmentJob[]>;
}

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
