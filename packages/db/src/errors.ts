/**
 * Gate 11 §24 — typed persistence-error taxonomy. Callers (Server Actions,
 * API routes) can distinguish these without parsing driver-specific
 * messages, and none of these constructors accept or embed a connection
 * string, credential, or raw driver stack trace in the user-facing
 * `message` — see each constructor's own doc comment.
 */
export type PersistenceErrorCode = "PERSISTENCE_UNAVAILABLE" | "PERSISTENCE_CONFLICT" | "PERSISTENCE_TRANSACTION_FAILED" | "PERSISTENCE_CONFIGURATION_ERROR";

export class PersistenceError extends Error {
  constructor(
    public readonly code: PersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

/** Thrown when the configured storage driver cannot be reached at all (connection refused, DNS failure, auth rejected by the database itself). Never includes the connection string or credential — only the driver name and chain id, if relevant. */
export class PersistenceUnavailableError extends PersistenceError {
  constructor(driver: string, cause?: unknown) {
    super("PERSISTENCE_UNAVAILABLE", `The ${driver} persistence backend is not reachable right now.`);
    this.cause = cause;
  }
}

/** Thrown when a compare-and-set write loses the race — the caller's expected prior state no longer matches what is actually stored. Not a failure of the database itself. */
export class PersistenceConflictError extends PersistenceError {
  constructor(detail: string) {
    super("PERSISTENCE_CONFLICT", detail);
  }
}

/** Thrown when an atomic multi-statement write could not complete as a unit and was rolled back. */
export class PersistenceTransactionFailedError extends PersistenceError {
  constructor(detail: string, cause?: unknown) {
    super("PERSISTENCE_TRANSACTION_FAILED", detail);
    this.cause = cause;
  }
}

/**
 * Thrown when the environment asks for a storage driver that isn't
 * actually configured to run — e.g. `MARKED_STORAGE_DRIVER=postgres` with
 * no `DATABASE_URL` set. This is a fail-closed configuration error, never
 * a silent fallback to a different driver (Gate 11 §9).
 */
export class PersistenceConfigurationError extends PersistenceError {
  constructor(detail: string) {
    super("PERSISTENCE_CONFIGURATION_ERROR", detail);
  }
}
