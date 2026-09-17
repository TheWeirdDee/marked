# Gate 11 — result

## Verdict: PASS

A real hosted Postgres database (Neon) was migrated and exercised by the full mandatory test battery, for real, and every test passed. The one item the first pass of this gate could not close — "a real hosted Postgres instance was actually exercised" — is now closed; see `evidence/production-persistence/hosted-production-proof.md` for the full account, including two genuine test-infrastructure bugs this real exercise surfaced and fixed (neither was a defect in `PostgresFulfillmentJobStore` itself — see that file's "Two genuine bugs" section) and an honestly-reported Neon cold-start connection flake that was root-caused and fixed rather than retried past.

## Pass-condition checklist (Gate 11 §35)

- [x] current storage architecture audited — `evidence/production-persistence/current-storage-audit.md`
- [x] production store abstraction clean — `FulfillmentJobStore` interface extended (additive), business logic (`fulfillment-actions.ts`, `job-store.ts`) retyped from the concrete `SqliteFulfillmentJobStore` class to the interface
- [x] SQLite retained for local/test use — default driver, unchanged on-disk behavior for the five original methods
- [x] Postgres production implementation exists — `PostgresFulfillmentJobStore`, complete, typechecked, lint-clean
- [x] production does not silently fall back to SQLite — `MARKED_STORAGE_DRIVER=postgres` with no `DATABASE_URL` throws `PersistenceConfigurationError`
- [x] schema/migration exists — `packages/db/migrations/0001_init.sql`, `pnpm db:migrate`, idempotent, tracked in `schema_migrations`
- [x] job state persists durably — proven for SQLite (real file, real restart) AND for Postgres (real hosted Neon database, real reconnect — `evidence/production-persistence/hosted-production-proof.md`)
- [x] audit history persists durably — same as above, both backends
- [x] atomic compare-and-set proven — **for SQLite**, both the pre-existing execution-claim CAS and the job-level `saveWithCas`, including a genuine two-concurrent-caller race test. **For Postgres**, the same, now proven for real against the hosted database (`evidence/production-persistence/atomicity.md`).
- [x] concurrent claim test proven — SQLite: yes, real. Postgres: yes, real, against the hosted database (`postgres-fulfillment-job-store.hosted.test.ts`).
- [x] restart/reconnect persistence proven — SQLite: yes, real. Postgres: yes, real, against the hosted database.
- [x] rollback atomicity proven — SQLite: yes, real, via a genuine forced mid-transaction failure (`evidence/production-persistence/rollback-proof.md`). Postgres: yes, real, same forced-failure technique, against the hosted database.
- [x] serialization round-trip proven — `FulfillmentJob`/`FulfillmentJobEvent` round-trip byte-identical through SQLite (proven, real) and through a real hosted Postgres JSONB column, including a dedicated unicode/quotes/backslashes/newlines/emoji test (`postgres-fulfillment-job-store.hosted.test.ts`)
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
- [x] full tests/typecheck/lint/build pass — `pnpm typecheck`/`pnpm lint`/`pnpm test`/`pnpm build` all re-run after every fix in this pass: 631 passed, 2 explicitly skipped (both Postgres files' own skip guard when `DATABASE_URL` is unset — the normal `pnpm test` path, since a hosted credential is never required for local dev/CI), 0 failed; typecheck/lint/build all clean; `pnpm build` re-confirmed to leave `apps/web/.data/` untouched (the §21 build-side-effect fix still holds)
- [x] `pnpm verify:gate6` re-run — `receiptHash: 0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`, unchanged
- [x] `pnpm verify:historical` re-run — all 353-record statistics (N, mean, median, every percentile/bucket, Compound/Uniswap breakdowns) match the committed Gate 8 baseline exactly

**Hosted production persistence:**
- [x] a real hosted Postgres instance was actually exercised — **MET.** See `evidence/production-persistence/hosted-production-proof.md`: 17 Postgres-specific tests (10 contract + 7 dedicated concurrency/rollback/restart/serialization), all passing for real against a hosted Neon database, combined with the pre-existing 43 SQLite/in-memory tests for a clean 60/60 in that capture.

## A genuine bug found and fixed during this gate (not something the checklist above asked for, but directly relevant to "Vercel build passes")

`pnpm build` was empirically found to open a real database connection as a side effect — `apps/web/src/app/app/page.tsx` (`/app`) calls `getAppStore()`/`listJobs()` unconditionally, and Next.js's build-time static/dynamic classification pass executes that code even though the route ends up marked dynamic. With SQLite this only created a harmless local file during build; with `MARKED_STORAGE_DRIVER=postgres` configured, it would have made `next build` itself open a live production database connection — a real deployment risk. Fixed with `export const dynamic = "force-dynamic"` on the three DB-backed pages; re-tested and confirmed a clean build no longer touches `.data/` at all. Full writeup: `evidence/production-persistence/architecture.md`.

## Hosted-persistence gap — closed

The user supplied a real Neon `DATABASE_URL` in the root `.env.local` (gitignored, never printed, echoed, committed, or exposed in any command output — see `evidence/production-persistence/security-scan.md`'s second pass) and confirmed `MARKED_STORAGE_DRIVER=postgres`. From that point:

1. `pnpm db:migrate` was run for real against the hosted database (`[apply] 0001_init.sql`), then re-run to confirm idempotency (`[skip] 0001_init.sql (already applied)`).
2. The full Postgres test battery — contract suite, mandatory concurrent-worker races, mandatory forced-failure rollback, restart/reconnect, serialization round-trip — was run for real and captured as `evidence/production-persistence/hosted-postgres-test-output.txt`.
3. Two genuine test-infrastructure bugs and one genuine Neon cold-start connection-timeout issue were found and fixed (not worked around) — full account in `evidence/production-persistence/hosted-production-proof.md`.
4. Every regression check above (typecheck/lint/test/build/`verify:gate6`/`verify:historical`) was re-run clean after those fixes.
5. This file's verdict was updated from BLOCKED to PASS only because every item above is genuinely true, per the standing instruction not to claim PASS otherwise.
