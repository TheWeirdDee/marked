# Marked — Testing

## Test taxonomy

| Category | Where | What it proves |
|---|---|---|
| **Unit** | Every `packages/*/src/**/*.test.ts`, `apps/web/src/**/*.test.ts` | Pure-function correctness, isolated |
| **Property/invariant** | `packages/core/src/fulfillment-state-machine.test.ts` | The state machine's own shape — no orphan states, no illegal shortcut, every terminal status truly terminal (a full breadth-first reachability walk, not a handful of examples) |
| **Contract** | `packages/db/src/fulfillment-job-store.contract.ts`, run against both `SqliteFulfillmentJobStore` and `PostgresFulfillmentJobStore` | The two persistence backends are behaviorally interchangeable — one shared assertion battery, not two independently-written suites that merely happen to both be green |
| **Integration** | `apps/web/src/lib/*.test.ts` (e.g. `fulfillment-actions.test.ts`, `agent/actions.test.ts`) | Real store instances, real (mocked-network) Server Action call paths, real before/after state assertions |
| **Hosted Postgres** | `packages/db/src/postgres-fulfillment-job-store.{contract,hosted}.test.ts` | Atomicity, concurrency, rollback, restart, and serialization proven against a real Neon database, not just SQLite — see "Hosted DB test isolation" below |
| **Adversarial agent** | `apps/web/src/lib/agent/actions.test.ts`, `packages/core/src/agent-plan.test.ts` | The deterministic validator rejects every named authority-injection/malformed-output case |
| **Historical reproduction** | `pnpm verify:historical`, `pnpm reproduce:historical` | The Gate 8 baseline is independently recomputable from the committed raw dataset, by a script sharing zero aggregation code with the primary one |
| **Canonical receipt verification** | `pnpm verify:gate6` | The Gate 6 receipt is independently re-derivable from live Sepolia state, not merely replayed from a saved file |
| **Security** | Concurrency-race tests (`fulfillment-actions.test.ts`), rate-limit tests (`agent/rate-limit.test.ts`), malformed-input tests (`postgres-fulfillment-job-store.malformed-url.test.ts`), the state-machine reachability test | Gate 12's own regression-tested fixes — every one reproduces the bug failing, then passes after the fix |

## Commands

```bash
pnpm typecheck   # tsc --noEmit, all packages — no network, no DB
pnpm lint        # eslint + next lint — no network, no DB
pnpm test        # vitest -r across all packages — see below for exactly what this does and doesn't touch
pnpm build       # next build — no DB connection, no migration, no network write (verified every gate)
```

**`pnpm test` performs zero blockchain writes and, by default, zero destructive database operations** — see "Hosted DB test isolation" below. It does not require `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY` (agent tests mock `fetch`), `DATABASE_URL` (Postgres tests skip cleanly without it), or `KEEPERHUB_API_KEY` (no test calls the real KeeperHub API).

## External dependencies by command

| Command | Network | Database | LLM key | KeeperHub key | Blockchain credential |
|---|---|---|---|---|---|
| `pnpm typecheck`/`lint`/`build` | No | No | No | No | No |
| `pnpm test` (default) | No | No (Postgres tests self-skip) | No (mocked) | No | No |
| `pnpm test` with `DATABASE_URL` set, no `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS` | Yes (probe only, refuses before any write — see below) | Read-only probe attempt, refused before any real operation | No | No | No |
| `pnpm test` with `DATABASE_URL` **and** `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` | Yes | **Yes — destructive** (see below) | No | No | No |
| `pnpm verify:gate6` | Yes (Sepolia RPC) | No | No | No | No — read-only |
| `pnpm verify:historical`/`reproduce:historical`/`spot-check:historical` | Yes (mainnet RPC) | No | No | No | No — read-only |
| `pnpm prove:cactus`/`prove:governor`/`prove:erc20-postcondition`/`prove:fulfillment-commitment` | Yes | No | No | No | No — read/simulate-only |
| `pnpm prove:keeperhub`/`prove:closed-loop` | Yes | No | No | Yes (simulate-only surface) | No |
| `pnpm prove:agent-hardening` | No | No | No | No | No — offline adversarial-input suite |
| `pnpm prove:agent-live-model` | Yes | No | Yes (`OPENROUTER_API_KEY`) | No | No |

**No command reachable via any `pnpm` script alias in this repository can perform a real blockchain write.** The two scripts that can (`scripts/gate5-deploy-and-queue.ts`, `scripts/gate5-keeperhub-execute.ts`) have **no `pnpm` script alias at all** — they require a developer to explicitly run `tsx scripts/gate5-....ts` directly, a deliberate extra step outside the routine script surface. See `evidence/system-audit/repository-map.md` §44 and `evidence/system-audit/script-safety-git-security.md`.

## Hosted DB test isolation

**This is the single most important safety rule in this document.** `packages/db/src/postgres-fulfillment-job-store.contract.test.ts` and `.hosted.test.ts` exercise a real Postgres database, including destructive operations (table-wide `DELETE`, real `INSERT`s, idempotent DDL). Before Gate 12, these files ran against **any** reachable `DATABASE_URL` with no other check — a real, S1-severity safety gap (a CI runner or developer machine with a real `DATABASE_URL` set for an unrelated reason could have had its data silently wiped by `pnpm test`).

**Fixed**: both files now require, via `packages/db/src/live-postgres-test-guard.ts`, **both**:

```bash
DATABASE_URL=<a database you are CERTAIN is disposable>
MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true
```

Without the second flag — even with `DATABASE_URL` set and fully reachable — every test in both files reports an explicit, descriptive skip and **never opens a connection at all**. This is verified in both directions as part of this project's own regression suite.

**Never** set `MARKED_ALLOW_DESTRUCTIVE_DB_TESTS=true` against a database that also holds real Marked data, a shared team dev database, or anything you are not personally certain is disposable and dedicated to this test suite.

There is currently no separate `TEST_DATABASE_URL` variable — `DATABASE_URL` itself is what the guarded test files read, gated by the second flag above. If this project later adopts a distinct `TEST_DATABASE_URL` to further separate test and production connection strings, this document and `VERCEL_ENVIRONMENT.md` must be updated together, in the same commit as that change.

## No-write guarantees, restated

- `pnpm test` and `pnpm build`: zero blockchain writes, zero destructive DB operations by default.
- Every `prove:*`/`verify:*`/`reproduce:*`/`spot-check:*` script: read/simulate-only, confirmed by tracing each script's own top-level logic and by the repository-wide write-path grep (`evidence/system-audit/repository-map.md`).
- The only two write-capable scripts in the repository are not reachable through any `pnpm` alias.

## Repeated / flaky-test policy

A test that fails intermittently is diagnosed, not silenced. The established discipline (from Gate 11's own hosted-database work, re-applied and re-confirmed in Gate 12): before raising a timeout or retrying a flaky test, classify the cause — race, shared mutable state, genuine network latency, or a wrong assumption. Only raise a timeout once latency is confirmed to be the actual cause (e.g., other tests in the same run completing within the same window, or a direct isolated connection attempt succeeding once warm). Gate 12's new concurrency/rate-limit tests were designed from the start to avoid known flake classes — they use `Promise.all` against genuinely independent store instances rather than sequential awaits, and inject explicit timestamps into the rate limiter rather than relying on wall-clock `Date.now()` + `sleep()`.

## Proof reproduction

```bash
pnpm verify:gate6         # re-derive the canonical Gate 6 receipt from live Sepolia state
pnpm verify:historical    # re-recompute every Gate 8 statistic from the committed dataset
pnpm prove:agent-hardening  # re-run the full adversarial-input suite against the deterministic validator
```

Each of these is read-only and safe to run repeatedly, including against the committed canonical evidence — none of them mutate `evidence/` except for the timestamp/block-height fields that live re-verification legitimately updates on every run (the canonical hashes themselves never change; see `DECISIONS.md` DEC-028 for a worked example of exactly which fields are expected to change and which are not).

## Historical reproduction

`pnpm reproduce:historical` recomputes the Gate 8 dataset from raw on-chain logs; `pnpm verify:historical` independently re-verifies the committed dataset's statistics using a second script that shares zero aggregation code with the first. Both are read-only against mainnet RPC.

## Security suite

The tests that specifically prove Gate 12's fixes: `apps/web/src/lib/fulfillment-actions.test.ts` (ARM/APPROVE/DISARM concurrency), `apps/web/src/lib/agent/rate-limit.test.ts` + integration tests in `agent/actions.test.ts` (cost-abuse guard), `packages/db/src/postgres-fulfillment-job-store.malformed-url.test.ts` (fail-closed config errors), `apps/web/src/lib/agent/provider.test.ts`'s typo-fail-closed case, and `packages/core/src/fulfillment-state-machine.test.ts`'s reachability check. Every one of these reproduces the original bug failing before its corresponding fix, and passes after — see `evidence/system-audit/findings.md` for the full account of each.
