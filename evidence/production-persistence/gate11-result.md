# Gate 11 — result

## Verdict: BLOCKED — USER DATABASE SETUP REQUIRED (for the hosted-persistence claim only)

Everything buildable without a real Postgres connection is complete and passing. The one claim this gate cannot make — "a real hosted Postgres instance was actually exercised" — genuinely requires the user to supply a `DATABASE_URL`, because no local, containerized, or hosted Postgres was reachable in this environment (no Docker installed, no local `psql`/Postgres service, and this repository's own `.env.local` `DATABASE_URL` is still the unedited `.env.example` placeholder — verified by reading the file directly, not assumed). Per Gate 11 §19/§35, this is reported honestly rather than downgraded silently or worked around with a fake/mocked connection.

## Pass-condition checklist (Gate 11 §35)

- [x] current storage architecture audited — `evidence/production-persistence/current-storage-audit.md`
- [x] production store abstraction clean — `FulfillmentJobStore` interface extended (additive), business logic (`fulfillment-actions.ts`, `job-store.ts`) retyped from the concrete `SqliteFulfillmentJobStore` class to the interface
- [x] SQLite retained for local/test use — default driver, unchanged on-disk behavior for the five original methods
- [x] Postgres production implementation exists — `PostgresFulfillmentJobStore`, complete, typechecked, lint-clean
- [x] production does not silently fall back to SQLite — `MARKED_STORAGE_DRIVER=postgres` with no `DATABASE_URL` throws `PersistenceConfigurationError`
- [x] schema/migration exists — `packages/db/migrations/0001_init.sql`, `pnpm db:migrate`, idempotent, tracked in `schema_migrations`
- [x] job state persists durably — proven for SQLite (real file, real restart); implemented identically for Postgres, unproven against a live connection
- [x] audit history persists durably — same as above
- [x] atomic compare-and-set proven — **for SQLite**, both the pre-existing execution-claim CAS and the new job-level `saveWithCas`, including a genuine two-concurrent-caller race test (`evidence/production-persistence/atomicity.md`). **For Postgres**, implemented with the correct atomic-statement pattern, not exercised against a live server.
- [x] concurrent claim test proven — SQLite: yes, real. Postgres: written, skipped (no connection).
- [x] restart/reconnect persistence proven — SQLite: yes, real. Postgres: written, skipped.
- [x] rollback atomicity proven — SQLite: yes, real, via a genuine forced mid-transaction failure (`evidence/production-persistence/rollback-proof.md`). Postgres: same transaction mechanism (`sql.begin`), not exercised.
- [x] serialization round-trip proven — `FulfillmentJob`/`FulfillmentJobEvent` round-trip byte-identical through SQLite (proven, real) and through the Postgres store's own `JSON.parse(JSON.stringify(...))` normalization path (typechecked, not exercised against a live JSONB column)
- [x] missing `DATABASE_URL` fails closed — `job-store.ts`'s `buildStore()`, throws `PersistenceConfigurationError`, no fallback
- [x] serverless connection strategy documented — `evidence/production-persistence/architecture.md` §"Connection handling for serverless"
- [x] Vercel build passes — confirmed; also found and fixed a real build-time database side-effect bug (see below)
- [x] actual env usage audited — `VERCEL_ENVIRONMENT.md` updated, `evidence/production-persistence/environment-audit.md`
- [x] `VERCEL_ENVIRONMENT.md` accurate — updated for `MARKED_STORAGE_DRIVER`/`DATABASE_URL`'s new real consumption
- [x] Cactus corrections retained — verified present in the working tree from the prior gate (uncommitted, now included in this gate's commit sequence per Gate 11 §27)
- [x] `/app/new` education retained — same
- [x] no new blockchain writes — every Gate 11 change is TypeScript/SQL/Markdown; zero `sendTransaction`/signer/private-key usage anywhere in `packages/db` or the modified `apps/web` files
- [x] no secret leakage — `evidence/production-persistence/security-scan.md`
- [x] canonical Gate 2/5/6 values unchanged — re-verified via `pnpm verify:gate6`, `receiptHash` identical
- [x] Gate 8 verification unchanged — re-verified via `pnpm verify:historical`, all statistics match
- [x] agent deterministic boundary unchanged — no file under `packages/core/src/agent-plan.ts` or `apps/web/src/lib/agent/` touched this gate
- [x] full tests/typecheck/lint/build pass — 631 passed, 1 explicitly skipped (Postgres contract suite), 0 failed; typecheck/lint/build all clean

**If claiming hosted production persistence:**
- [ ] a real hosted Postgres instance was actually exercised — **NOT MET.** See "Exact user action required" below.

## A genuine bug found and fixed during this gate (not something the checklist above asked for, but directly relevant to "Vercel build passes")

`pnpm build` was empirically found to open a real database connection as a side effect — `apps/web/src/app/app/page.tsx` (`/app`) calls `getAppStore()`/`listJobs()` unconditionally, and Next.js's build-time static/dynamic classification pass executes that code even though the route ends up marked dynamic. With SQLite this only created a harmless local file during build; with `MARKED_STORAGE_DRIVER=postgres` configured, it would have made `next build` itself open a live production database connection — a real deployment risk. Fixed with `export const dynamic = "force-dynamic"` on the three DB-backed pages; re-tested and confirmed a clean build no longer touches `.data/` at all. Full writeup: `evidence/production-persistence/architecture.md`.

## Exact user action required to close the hosted-persistence gap

1. Create a Postgres database. Any standard Postgres works (Neon is the current default the Vercel Marketplace routes new projects to, since first-party "Vercel Postgres" was discontinued in December 2024 — verified live during this gate; a self-hosted or other provider's Postgres works identically since `PostgresFulfillmentJobStore` is not vendor-specific).
2. Copy its connection string — the pooled/serverless-friendly variant if the provider distinguishes one (Neon calls this the "pooled connection string").
3. Put it in this repository's root `.env.local` (gitignored, never commit it) as:
   ```
   DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
   ```
4. Run `DATABASE_URL=<that value> pnpm db:migrate` to create the schema.
5. Tell me when complete. I will then:
   - re-run `packages/db/src/postgres-fulfillment-job-store.contract.test.ts` for real (it will automatically stop skipping once `DATABASE_URL` is reachable and migrated),
   - capture the real concurrent-claim/restart/rollback proof output as `evidence/production-persistence/hosted-production-proof.md`,
   - update this file's verdict to PASS if and only if that suite genuinely passes.

Do not paste the connection string into chat if avoidable — if you must, I will treat it exactly as the prior gate treated the OpenRouter key: write it only to the gitignored `.env.local`, never into any tracked file, and grep the repository for it before any commit.
