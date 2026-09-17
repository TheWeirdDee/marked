/**
 * Gate 12 §11/§33 — a real hosted Neon database was exercised for the first
 * time in Gate 11, and the test files that exercise it (`*.contract.test.ts`,
 * `*.hosted.test.ts`) run destructive operations against whatever
 * `DATABASE_URL` happens to be set in the environment: table-wide `DELETE`,
 * `INSERT`, and idempotent-but-still-real DDL (`CREATE TABLE IF NOT EXISTS`).
 *
 * That was safe in this gate's own development flow, where `DATABASE_URL`
 * was deliberately set to point at a disposable Gate-11 test project. It is
 * NOT safe as a general rule: `pnpm test` must never destructively touch
 * whatever database a `DATABASE_URL` in the environment happens to point at
 * merely because it is reachable — a CI runner or a developer machine could
 * plausibly have a real `DATABASE_URL` set for an unrelated reason (e.g. a
 * deployment preview), and running `pnpm test` must never wipe it.
 *
 * This guard requires a SECOND, explicit opt-in — `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true`
 * — before any live Postgres test file so much as opens a connection.
 * `DATABASE_URL` being set and reachable is necessary but not sufficient.
 */
export const DESTRUCTIVE_DB_TEST_ENV_VAR = "MARKED_ALLOW_DESTRUCTIVE_DB_TESTS";

export interface DestructiveDbTestGuardResult {
  /** true only when both DATABASE_URL is set AND the explicit opt-in flag is exactly "true". */
  allowed: boolean;
  /** Set when allowed is false — always non-empty, always safe to print (never includes DATABASE_URL's value). */
  reason: string;
  /** The DATABASE_URL to use, only present when allowed is true. */
  databaseUrl: string | undefined;
}

export function checkDestructiveDbTestGuard(): DestructiveDbTestGuardResult {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    return { allowed: false, reason: "DATABASE_URL is not set", databaseUrl: undefined };
  }

  const optIn = process.env[DESTRUCTIVE_DB_TEST_ENV_VAR];
  if (optIn !== "true") {
    return {
      allowed: false,
      reason:
        `DATABASE_URL is set, but ${DESTRUCTIVE_DB_TEST_ENV_VAR} is not "true" — refusing to connect. ` +
        `This is a safety guard, not a connectivity failure: the database may be perfectly reachable. ` +
        `These tests run destructive operations (table-wide DELETE, INSERT, idempotent DDL) against whatever ` +
        `DATABASE_URL points at. Set ${DESTRUCTIVE_DB_TEST_ENV_VAR}=true only when you are certain that database ` +
        `is disposable and used for nothing but this test suite — never against a database that also holds real ` +
        `Marked data. See evidence/system-audit/database-audit.md.`,
      databaseUrl: undefined,
    };
  }

  return { allowed: true, reason: "", databaseUrl };
}
