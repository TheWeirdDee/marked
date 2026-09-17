# Marked — Operations

Deployment and operational runbook. For the full environment-variable audit, see `VERCEL_ENVIRONMENT.md` (this document does not duplicate it). For test-time operational safety (destructive-test guards, etc.), see `docs/TESTING.md`.

## Production environment

Marked's deployed surface is `apps/web`, a Next.js App Router app targeting Vercel. Production persistence **must** be Postgres — the default (`MARKED_STORAGE_DRIVER` unset, i.e. SQLite) writes to the local filesystem, which does not survive Vercel's per-instance, ephemeral filesystem. Set `MARKED_STORAGE_DRIVER=postgres` and `DATABASE_URL` for any real deployment. See `VERCEL_ENVIRONMENT.md` for the exact variable table.

## Postgres

Any standard Postgres works — `PostgresFulfillmentJobStore` (`packages/db`) uses `postgres` (porsager/postgres) directly, not a vendor-specific driver. Connection handling: `max: 1` per store instance (one pooled connection reused across requests to the same warm serverless function instance — the standard porsager/postgres recommendation for that environment). `ssl: "require"` is always set, matching every current hosted Postgres provider's default. This has been proven, not just implemented, against a real hosted Neon database (Gate 11) — see `evidence/production-persistence/hosted-production-proof.md`.

## Migrations

Run explicitly, never automatically:

```bash
DATABASE_URL=<your real connection string> pnpm db:migrate
```

Applies every `.sql` file under `packages/db/migrations/`, in filename order, inside its own transaction, tracked in a `schema_migrations` table. Safe to re-run — already-applied migrations are skipped, not reapplied (`[skip] ... (already applied)`). Every migration is additive-only (`CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`) — never a `DROP`/`TRUNCATE`. **`pnpm build` never runs a migration, and the app never migrates on startup** — a real Gate 11 bug of a related kind (a database connection opened as a `pnpm build` side effect) was found and fixed; `pnpm build` is re-verified clean of any DB touch as of every regression run through Gate 12.

## Startup

The app lazily opens its `FulfillmentJobStore` on first use (a module-level singleton per warm serverless instance, `apps/web/src/lib/job-store.ts`) — there is no startup migration, seed, or blocking DB call before the app can serve a request. A misconfigured `MARKED_STORAGE_DRIVER`/`DATABASE_URL` fails closed with a typed `PersistenceConfigurationError` the first time persistence is actually touched, not at process boot.

## Health / failure behavior by dependency

| Dependency | Failure mode | What the operator sees |
|---|---|---|
| **Postgres** | Unreachable/wrong password/timeout | `PersistenceUnavailableError` — never a silent fallback to SQLite |
| | Malformed `DATABASE_URL` | `PersistenceConfigurationError` (fixed Gate 12 — previously a raw driver `TypeError`) |
| **Ethereum/Sepolia RPC** | Timeout/malformed response | An uncaught error from viem's own client propagates — ARM/resolution blocks rather than proceeding on stale data, but the surfaced error is not yet one of this project's own typed error classes (a known, minor gap) |
| **KeeperHub** | Any failure | Not reachable from the live deployed app at all — see `docs/SECURITY.md` "Write-path boundary" |
| **OpenRouter/Anthropic (agent)** | Missing key, 401/403/429/500, timeout, malformed output | Typed `AgentProviderError`; the agent-facing UI shows "Agent unavailable" or the specific error — never a fabricated response, never a job mutation |
| **Cactus** | 404/429/500/malformed page/timeout | Typed `CactusResolutionError`; never falls back to trusting raw user-supplied proposal coordinates |

## Recovery / reconciliation

See `docs/ARCHITECTURE.md` §21 and `docs/SECURITY.md` "Recovery." The state machine's `UNKNOWN_RECONCILING` status exists for exactly this purpose; no application code in the current deployed app currently drives a job through it, since the live app does not currently trigger real execution (see the write-path boundary in `docs/SECURITY.md`). If/when execution is wired into the live app, this section must be revisited and the reconciliation loop's actual operational behavior documented for real, not just structurally.

## Database outage

Every store method fails closed with a typed `PersistenceUnavailableError`. No mutation partially applies — `saveJobAndEvents`/`saveWithCas` are single transactions; a mid-transaction failure rolls back both halves (proven for real against both SQLite and a hosted Postgres database, including via a genuine forced-failure technique, not merely read from the driver's documentation).

## RPC outage

ARM-time authorization re-verification requires a live RPC read; an RPC failure blocks ARM rather than proceeding with stale/assumed-good authorization (fails closed by omission — there is no code path that treats an RPC error as "authorization unchanged").

## KeeperHub outage

Not applicable to the currently-deployed app (no live code path reaches KeeperHub). Relevant only to the offline proof scripts, which are developer-run and not part of any operational surface.

## LLM outage

Every agent-facing action returns `{ok: false, reason}` rather than throwing; no job mutation is possible from any agent code path regardless of provider state (proven by before/after job-state-snapshot tests).

## Cactus outage

Falls through typed errors to the UI's error state (`/app/new?error=resolution_failed`); never silently substitutes unvalidated user input for a resolved coordinate.

## Secret rotation

- `MARKED_DEMO_SESSION_TOKEN`: rotate by setting a new value in the deployment's env config and redeploying. Existing sessions built from the old flow simply need to re-log-in (the cookie carries no value tied to the specific token, only a marker — see `docs/SECURITY.md`).
- `DATABASE_URL`: rotate via your Postgres provider's own credential-rotation flow, then update the env var and redeploy. No code change needed.
- `CACTUS_API_KEY`/`OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`/`KEEPERHUB_API_KEY`: rotate at the provider, update the env var, redeploy. None of these are cached/embedded anywhere outside `process.env` reads at call time.
- **Never** commit a rotated-out credential anywhere, even temporarily, even in a commit that's later reverted — git history is permanent. If a real secret is ever found in this repository's history, stop, do not push, and report it (see `docs/SECURITY.md` "Reporting vulnerabilities").

## Deployment

1. Provision a Postgres database (Neon or equivalent).
2. Set `DATABASE_URL` and `MARKED_STORAGE_DRIVER=postgres` in Vercel's environment config (Production and Preview separately, if both are used).
3. Run `DATABASE_URL=<value> pnpm db:migrate` once, from a trusted machine, against that database — not as part of the Vercel build.
4. Set every other required variable per `VERCEL_ENVIRONMENT.md`.
5. Deploy. `pnpm build` performs no DB/network side effects (verified every gate).
6. Confirm the deployed app's read-only pages (`/`, `/demo`, `/evidence`, `/docs`) render, then confirm `/app` login and a real `/app/new` resolution work before treating the deployment as live.

## Rollback

Standard Vercel rollback (redeploy a prior build) is safe — migrations are additive-only and forward-compatible; a prior build's code reading a newer schema's tables works unless a migration removed/renamed a column the prior build depended on (no migration has ever done this). If a migration ever needs to be reverted, write and commit a new, explicit down-migration file rather than manually editing the database — this project has no automated down-migration tooling yet, so a genuine rollback of schema state is a manual, reviewed SQL operation, not a `pnpm` command.

## Evidence / receipt verification

`pnpm verify:gate6` independently re-derives the canonical Gate 6 receipt from live Sepolia state and confirms `receiptHash` matches the committed value. `pnpm verify:historical` independently re-recomputes every Gate 8 historical-baseline statistic from the committed dataset. Both are read-only, safe to run at any time, including against production evidence, and are part of this project's own regression discipline (re-run after every gate's changes).

## Incident rules

- **Never** run a live-Postgres test suite (`MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true`) against a database that also holds real application data — see `docs/TESTING.md`.
- **Never** manually resubmit an ambiguous/unknown execution outcome by hand (re-running a script with a fresh identity) — this defeats the entire unknown-outcome reconciliation design (`docs/SECURITY.md` "Recovery"). If a real execution is ever wired into the live app and reaches `UNKNOWN_RECONCILING`, the correct operator action is to let the reconciliation logic run (or extend it), never to bypass it with a manual resend.
- **Never** edit a persisted job's status directly in the database to "fix" a stuck state — every legal transition exists in `packages/core/src/fulfillment-state-machine.ts`'s transition table; a manual edit can produce a state the application's own invariants assume is impossible.
- **Never** commit or paste a real credential anywhere to "just get past" a blocked step — stop and ask, per this project's own established discipline.

## What operators must never manually bypass

The compare-and-set on job mutations, the execution-claim primary-key constraint, the destructive-DB-test guard, the typed persistence-error taxonomy, and the state-machine transition table are all safety mechanisms with a real design reason behind each — see `docs/ARCHITECTURE.md` and `docs/SECURITY.md`. None of them should ever be worked around at the database or infrastructure level "just this once."
