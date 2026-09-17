# Gate 12 §11/§12 — database hostile audit + migration safety

## §11 — Postgres hostile audit (HIGH PRIORITY per the gate prompt)

**Destructive-test safety — the headline item, see finding F-02 in `findings.md`.** Before this gate, `pnpm test` (or `vitest run` directly) against any environment with a reachable `DATABASE_URL` would unconditionally wipe `job_events`/`execution_claims`/`fulfillment_jobs` before every contract test, and write real rows via the hosted-concurrency/rollback tests, with zero check on whether that database was meant for this. **Fixed**: `packages/db/src/live-postgres-test-guard.ts` requires a second, explicit `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` opt-in before either live-Postgres test file opens a connection at all. Verified both directions (guard blocks without the flag; live suite genuinely runs with it).

**Cross-run/cross-test contamination**: root-caused and fixed in Gate 11 already (`resetBeforeEach` + `fileParallelism: false` in `packages/db/vitest.config.ts`) — re-verified this gate still holds (guard change doesn't affect this).

**Migration idempotency**: `pnpm db:migrate` re-run against the same database twice in Gate 11 produced `[apply]` then `[skip] (already applied)` — genuinely re-verified this gate is unaffected by any change made here (the migrate script itself was not touched).

**Migration partial failure / transaction behavior**: `migrate.ts` wraps each migration's DDL + its `schema_migrations` insert in one `sql.begin()` transaction — a failure partway through rolls back both together (verified by reading the code; Postgres supports transactional DDL, so this is a real, not merely intended, guarantee).

**Concurrent migration invocation**: not live-tested this gate (would require two real concurrent `pnpm db:migrate` processes against a live database, deliberately not attempted under the destructive-test guard's spirit without explicit need). Reasoned from the code: `schema_migrations.filename` is a `TEXT PRIMARY KEY`; two concurrent transactions both attempting to apply the same not-yet-applied migration would have one succeed and one fail its `INSERT` on the unique-constraint violation, rolling back that whole transaction (including its DDL, since it's transactional) — the losing process exits with a non-zero code and a real error, not silent corruption. Documented as reasoned-from-code, not live-proven.

**Old schema compatibility**: only one migration (`0001_init.sql`) exists; not applicable yet.

**Connection timeout / idle connection / cold start**: extensively exercised for real in Gate 11's hosted-proof work (`evidence/production-persistence/hosted-production-proof.md`) — a genuine Neon cold-start connect-timeout issue was found and fixed there (5s → 15s). Not re-derived here.

**Malformed `DATABASE_URL` / wrong password / unavailable host**: malformed-URL case is this gate's own new finding, F-07 (fixed — now throws `PersistenceConfigurationError`, not a raw driver `TypeError`). Wrong-password/unavailable-host were already covered by Gate 11's `wrapConnectionError` regex (`ECONNREFUSED|ENOTFOUND|ETIMEDOUT|...|password authentication failed` → `PersistenceUnavailableError`) — re-read this gate, unchanged, still correct.

**Transaction rollback / JSONB round-trip / bigint / large payloads / duplicate ids / event ordering / timestamps**: all already proven for real against the hosted Neon database in Gate 11 (`evidence/production-persistence/hosted-production-proof.md` — the BigInt-poisons-JSON.stringify forced-rollback technique, the unicode/quotes/backslashes/emoji serialization round-trip test). Not re-derived here; re-confirmed still passing in this gate's full regression run.

**CAS revision overflow**: `revision` is a Postgres `INTEGER` (max ~2.1 billion) incremented by at most 1 per write; not a realistic overflow risk for this product's actual write volume — not fixed, not treated as a real finding.

## §12 — Migration safety audit

- **Can it accidentally run against the wrong DB?** `pnpm db:migrate` requires `DATABASE_URL` to be explicitly set (errors immediately if absent: `"DATABASE_URL is not set. Nothing to migrate against — refusing to guess a connection."`) — there is no default/fallback connection string anywhere. Running it against "the wrong DB" requires the operator to have set `DATABASE_URL` to that DB themselves; the script does not compound that mistake.
- **Does it log `DATABASE_URL`?** No — confirmed by reading `migrate.ts` in full: only filenames and counts are logged, never the connection string.
- **Destructive SQL / implicit DROP/TRUNCATE?** `0001_init.sql` contains only `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` — grep-confirmed zero occurrences of `DROP`/`TRUNCATE`/`DELETE` anywhere in `packages/db/migrations/`.
- **Production startup never auto-migrates?** Confirmed — `apps/web/src/lib/job-store.ts`'s `buildStore()` never calls anything from `migrate.ts`; the migration runner is a separate script, invoked only via `pnpm db:migrate`, never imported by the app.
- **Checksum/version handling**: `schema_migrations` tracks by filename only, not a content checksum — a migration file edited after being applied would silently NOT be re-applied (the filename is unchanged). This is a real, minor gap (no checksum-drift detection) but proportionate to this project's current single-migration state; not fixed this gate (would need a broader migration-tooling decision, e.g. adopting a real migration framework, which is out of this gate's narrow-fix scope).

**No migration may silently destroy data — confirmed true for the current migration set.**
