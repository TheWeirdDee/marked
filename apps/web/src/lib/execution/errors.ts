/** Typed errors for the ARMED -> AWAITING_APPROVAL -> FULFILLED_VERIFIED execution pipeline (apps/web/src/lib/execution/*). */

export class LiveExecutionDisabledError extends Error {
  constructor() {
    super(
      'Live KeeperHub execution is disabled on this deployment (MARKED_ENABLE_KEEPERHUB_EXECUTION is not "true"). ' +
        "This is deliberate, not an oversight: today's demo authentication does not distinguish a real operator " +
        "from any visitor who opens a demo session (see finding F-03), which is not a safe boundary to put in " +
        "front of a real blockchain write. The full execution pipeline below this gate is implemented and " +
        "tested end-to-end with mocks; only its live enablement is withheld pending auth hardening.",
    );
    this.name = "LiveExecutionDisabledError";
  }
}

export class JobNotArmedError extends Error {
  constructor(public readonly status: string) {
    super(`Cannot prepare this job for approval from state '${status}'. Preparation is only legal from ARMED.`);
    this.name = "JobNotArmedError";
  }
}

export class ExecutionAlreadyInFlightError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly requestHash: string,
  ) {
    super(
      `An execution attempt for job '${jobId}' (request ${requestHash}) was already claimed. Refusing to dispatch ` +
        "a second one for the same request -- call reconcileJob to pick up the existing attempt instead of retrying.",
    );
    this.name = "ExecutionAlreadyInFlightError";
  }
}

export class SandboxNeverExecutesError extends Error {
  constructor() {
    super(
      "The recovery-sandbox job never calls KeeperHub, by design (see apps/web/src/lib/job-store.ts). " +
        "Approving it only demonstrates the persistence/authentication engine, never live execution.",
    );
    this.name = "SandboxNeverExecutesError";
  }
}
