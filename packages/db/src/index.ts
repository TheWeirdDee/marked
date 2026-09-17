export class DbNotImplementedError extends Error {
  constructor() {
    super(
      "Persistence is not implemented yet. See packages/db/README.md for the planned " +
        "table list and GATES.md for which gate introduces each table.",
    );
    this.name = "DbNotImplementedError";
  }
}

export {
  InMemoryFulfillmentJobStore,
  type FulfillmentJobStore,
  type FulfillmentJobStoreSnapshot,
  type CasSaveResult,
  type ExecutionClaim,
  type ExecutionClaimResult,
} from "./fulfillment-job-store";

export { SqliteFulfillmentJobStore } from "./sqlite-fulfillment-job-store";
export { PostgresFulfillmentJobStore } from "./postgres-fulfillment-job-store";
export {
  PersistenceError,
  PersistenceUnavailableError,
  PersistenceConflictError,
  PersistenceTransactionFailedError,
  PersistenceConfigurationError,
  type PersistenceErrorCode,
} from "./errors";
