# Gate 12 §3/§44 — repository inventory and write-path map

## Workspace packages (pnpm-workspace.yaml)

| Package | Purpose |
|---|---|
| `apps/web` | The deployed Next.js App Router product — landing, demo, `/app` (auth-gated ARM/APPROVE/DISARM), `/proof/[id]`, `/evidence`, `/docs`. |
| `apps/cli` | A small standalone CLI (`marked` command), unrelated to the web app's request path. |
| `packages/core` | Domain logic: state machine, fulfillment job/event types, auth, receipt computation, agent-plan validation, fulfillability, recovery. No I/O. |
| `packages/db` | `FulfillmentJobStore` abstraction + `SqliteFulfillmentJobStore`/`PostgresFulfillmentJobStore`/`InMemoryFulfillmentJobStore`, migrations. |
| `packages/config` | `EnvSchema`/`parseEnv` — a strict, fail-closed env parser. Confirmed (Gate 11, re-confirmed this gate) NOT wired into any runtime path — test-only. |
| `packages/cactus` | Cactus/Tally proposal resolution: URL allowlist, GraphQL client, SSR-page fallback. |
| `packages/governor` | Onchain Governor Bravo reads: authorization hash, existence/state verification, freeze detection. |
| `packages/keeperhub` | KeeperHub REST client: `simulateContractCall` (read) and `executeContractCall` (write) as two structurally separate functions. |
| `packages/postconditions` | `ERC20TransferAdapter` — the one implemented, narrowly-scoped economic-postcondition verifier. |
| `scripts` | One-time, offline proof/verification scripts (Gate 2/5/6/8 proofs, KeeperHub seam proof, historical baseline reproduction/verification). Never imported by `apps/web`. |

## apps/web routes

- **Static/marketing (`○`):** `/`, `/demo`, `/docs`, `/docs/[slug]` (SSG), `/evidence`.
- **Dynamic, server-rendered (`ƒ`):** `/app`, `/app/fulfillments/[id]`, `/app/new`, `/proof/[id]`, and the four API routes below. **Correction (Gate 12 CACTUS-LIVE-001 investigation):** this file originally claimed all of these already carried the explicit `export const dynamic = "force-dynamic"` marker (Gate 11 §21's build-time-DB-side-effect fix); `/app/new/page.tsx` was in fact missing it — reading `searchParams` already made Next.js treat the route as dynamic in practice (confirmed `ƒ` in every build output this project has produced), so this was not a live bug, but the marker is now present there too, for consistency and explicitness, and this claim is corrected accordingly. See `evidence/system-audit/findings.md` CACTUS-LIVE-001 and `evidence/system-audit/cactus-live-compatibility.md`.
- **API routes (Route Handlers, not Server Actions):** `GET /api/fulfillment/state` (public, read-only, no auth), `POST /api/fulfillment/{arm,disarm,approve}` (each authenticates via `armJob`/`disarmJob`/`approveJob` before mutating).
- **Server Actions (`"use server"`):** `apps/web/src/app/app/actions.ts` (`enterDemoWorkspace`, `exitDemoWorkspace`, `armJobAction`, `disarmJobAction`, `approveJobAction`, `resolveAndOpenAction`), `apps/web/src/lib/agent/actions.ts` (`askAboutProposal`, `prepareCandidatePlan`, `askAboutFulfillment`, `askAboutReceipt`).

## Runtime filesystem writes

- SQLite mode only: `apps/web/.data/marked.sqlite` (+ WAL/SHM sidecars), created lazily by `job-store.ts`'s `buildStore()`. Confirmed NOT created by `pnpm build` (the Gate 11 fix still holds, re-verified this gate).
- No other runtime filesystem write exists anywhere in `apps/web`.

## Subprocess / child_process usage

Grep-confirmed: zero occurrences of `child_process`, `spawn`, `exec(` anywhere under `apps/web/src` or `packages/*/src`. `scripts/*.ts` are run directly by `pnpm`/`tsx`, not spawned by the app.

## §44 — complete write-path map (every write-capable call, and where it is/isn't reachable)

Repo-wide grep (excluding `node_modules`/`.git`) for `sendTransaction`, `writeContract`, `signTransaction`, `privateKeyToAccount`, `eth_sendRawTransaction`, `eth_sendTransaction`, `walletClient`, `createWalletClient`: **exactly one match in the entire repository** — `scripts/gate5-deploy-and-queue.ts`. Confirmed via a second grep that this script is never imported by `apps/web/src` or any `packages/*/src` file.

`packages/keeperhub/src/client.ts` exports exactly two functions: `simulateContractCall` (read-only) and `executeContractCall` (the one function capable of a real KeeperHub-mediated Governor execution). Grepping every importer of `executeContractCall` across the whole repo returns only: its own definition/re-export (`client.ts`, `index.ts`), its own tests (`client.test.ts`, `index.test.ts`), and two offline proof scripts (`scripts/gate5-keeperhub-execute.ts`, `scripts/prove-keeperhub-seam.ts`). **Zero occurrences under `apps/web/src`.**

Consistent with this, `packages/db`'s execution-claim primitive `tryClaimExecution` (Gate 7's duplicate-worker-protection CAS) is also grep-confirmed to be called nowhere in `apps/web/src` — the live web app's ARM→APPROVE flow computes and persists the `EXECUTING` status (`packages/core/src/fulfillment-job.ts`'s `approveFulfillmentJob`) but never actually dispatches anything to KeeperHub.

**Conclusion at Gate 12 (see finding F-06 in `findings.md`): the deployed web application had no code path capable of a real blockchain write.** Every actual on-chain write this project had performed up to that point (Gate 2's Governor deployment, Gate 5's KeeperHub-mediated Sepolia execution) was performed by an offline, developer-run script, never by the live app.

**CORRECTION (2026-09-18, KeeperHub execution-wiring task) — this is no longer the current state, self-corrected here rather than left stale.** `apps/web/src/lib/execution/approve-and-execute.ts` now imports and calls `executeContractCall` for real. The grep above, re-run today, would return a real match under `apps/web/src`. What now bounds it is a single, independent, default-off flag, `MARKED_ENABLE_KEEPERHUB_EXECUTION` — see `docs/SECURITY.md`'s Write-path boundary section (updated the same day) and `DECISIONS.md` DEC-030 for the full, current, accurate account. F-06 in `findings.md` is marked superseded, not deleted, per this project's standing discipline.

No ambiguous `execute(call, { simulate: maybe })` pattern exists anywhere — `simulateContractCall`/`executeContractCall` are two independent exported functions, never one function parameterized by a boolean.

`ENABLE_MAINNET_WRITE` is read only by `packages/config/src/env.ts` (dead code, never invoked at runtime — see `env-audit.md`); the actual guard in the one script capable of a real write, `scripts/gate5-keeperhub-execute.ts`, is a hardcoded `enableMainnetWrite: false` literal, not an env read — confirmed by direct read of that file, not merely inferred from the variable's presence in `.env.example`.
