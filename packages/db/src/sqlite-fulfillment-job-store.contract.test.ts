import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteFulfillmentJobStore } from "./sqlite-fulfillment-job-store";
import { runFulfillmentJobStoreContractTests } from "./fulfillment-job-store.contract";

/** Gate 11 §18-A — proves SqliteFulfillmentJobStore against the SAME contract battery PostgresFulfillmentJobStore is run against (see postgres-fulfillment-job-store.contract.test.ts). */
runFulfillmentJobStoreContractTests(
  "SqliteFulfillmentJobStore",
  async () => new SqliteFulfillmentJobStore(join(mkdtempSync(join(tmpdir(), "marked-contract-")), "test.db")),
  async (store) => {
    await store.close();
  },
);
