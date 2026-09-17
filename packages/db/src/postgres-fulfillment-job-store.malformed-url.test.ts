import { describe, expect, it } from "vitest";
import { PersistenceConfigurationError } from "./errors";
import { PostgresFulfillmentJobStore } from "./postgres-fulfillment-job-store";

/**
 * Gate 12 hostile audit (env-var malformed-value audit) — porsager/postgres's
 * `postgres()` constructor throws SYNCHRONOUSLY on a genuinely malformed
 * connection string (not merely an unreachable one), before any network I/O.
 * Previously uncaught here, this bypassed the typed PersistenceError
 * taxonomy the rest of this class promises every caller. No live database
 * or DATABASE_URL is needed for this test — it never attempts a connection.
 */
describe("PostgresFulfillmentJobStore — malformed connection string fails closed with a typed error", () => {
  it("throws PersistenceConfigurationError, not a raw driver TypeError, for a non-URL string", () => {
    expect(() => new PostgresFulfillmentJobStore("not-a-valid-connection-string")).toThrow(PersistenceConfigurationError);
  });

  it("the error message never contains the invalid value that was passed in", () => {
    const secret = "not-a-valid-connection-string-with-a-fake-token-abc123";
    try {
      new PostgresFulfillmentJobStore(secret);
      expect.fail("expected constructor to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PersistenceConfigurationError);
      expect((err as Error).message).not.toContain(secret);
      expect((err as Error).message).not.toContain("abc123");
    }
  });
});
