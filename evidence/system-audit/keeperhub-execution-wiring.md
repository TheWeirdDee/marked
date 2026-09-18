# KeeperHub execution wiring — internal system map, security invariants, and verification

Companion to `findings.md` KEEPERHUB-WIRING-001/002. This document records the trace of the existing system performed before any code was written, the resulting architecture, and the full verification record.

## System trace (before any edit)

```
UI (Card + <form action=...>)
  -> Server Action (apps/web/src/app/app/actions.ts)
     -> apps/web/src/lib/fulfillment-actions.ts: armJob / disarmJob / approveJob
        -> packages/core: armFulfillmentJob / disarmFulfillmentJob / approveFulfillmentJob (Gate 4, pure, synchronous, no I/O)
        -> packages/db: FulfillmentJobStore.saveWithCas (Gate 12 concurrency guard)
```

Traced and confirmed before writing anything:

1. `packages/keeperhub/src/client.ts` — `simulateContractCall`/`executeContractCall`, two structurally separate exported functions; `executeContractCall` requires an `ExplicitExecutionAuthorization` whose `requestHash` is checked locally against `hashContractCall(call)` before any network call.
2. `request-hash.ts` — SHA-256 over a canonical JSON encoding of the frozen call; used both as the local authorization check and as KeeperHub's own `Idempotency-Key` header value.
3. `local-validation.ts` — `KNOWN_CHAIN_IDS = [1, 11155111]` (a KeeperHub-package-local scope constraint, independent of and narrower than `packages/governor`'s `SUPPORTED_CHAINS`); `MAINNET_CHAIN_IDS` gated by `enableMainnetWrite`.
4. `lifecycle-execution-policy.ts` — `validateLifecycleExecutionPolicy` (field-by-field target/calldata/value/chain check against the expected plan) and `buildFrozenCallFromExecutionPlan`.
5. `packages/db/src/fulfillment-job-store.ts` — `tryClaimExecution`/`getExecutionClaim`, Gate 7's duplicate-worker-protection CAS, already on the `FulfillmentJobStore` interface and implemented by every store, but grep-confirmed unused by any `apps/web` code before this task.
6. `packages/core/src/fulfillment-job.ts` — `approveFulfillmentJob` only ever moves `AWAITING_APPROVAL -> EXECUTING`; never touches KeeperHub (by design — Gate 4's own doc comment: "No KeeperHub call, no network I/O: this function is synchronous").
7. `packages/core/src/fulfillment-state-machine.ts` — the full transition table already defined every hop from `ARMED` through `FULFILLED_VERIFIED`, unused by the live app for anything past `ARMED`/`DISARMED_BY_USER`.
8. `apps/web/src/app/app/actions.ts` — `armJobAction`/`disarmJobAction`/`approveJobAction`, each: authenticate, call the Gate 4 function, `revalidatePath`. `approveJobAction` called the same `approveJob` for every job id, sandbox or real.
9. `apps/web/src/app/api/fulfillment/{arm,disarm,approve,state}/route.ts` — the same logic, exposed as REST routes, each with a "no `jobId`" convenience form that targets the recovery-sandbox job.
10. `apps/web/src/lib/job-store.ts` — `getAppStore()` (driver-selected `FulfillmentJobStore` singleton), `RECOVERY_SANDBOX_JOB_ID`, `ensureSandboxSeedJob` (seeded from Gate 5's real recorded commitment fields, explicitly documented as never calling KeeperHub).
11. `apps/web/src/app/app/fulfillments/[id]/page.tsx` — the `ARMED` banner's own copy: "the live eligibility-to-execution orchestration for a newly-armed real proposal is out of scope here."
12. `apps/web/src/lib/fulfillment-actions.test.ts` — a direct, explicit statement of the gap: "AWAITING_APPROVAL is only reachable through live eligibility/simulation resolution, which this sandbox deliberately does not implement (Gate 7 instructions: no fabricated state progression)."
13. `apps/web/src/lib/governance.ts` — `rpcUrlFor`/`buildClient`, module-private; the exact chain-URL resolution the CACTUS-LIVE-001 fix centralized. Reused, not duplicated, by the new execution modules (both functions promoted to exported).
14. `scripts/gate5-keeperhub-execute.ts` — the one proven, real, end-to-end execution: resolve authorization -> arm -> lifecycle eligibility -> build execution plan -> simulate + caller-compatibility -> policy validation -> record approval -> **full revalidation of all four checks again, immediately before broadcast** -> idempotency identity -> `executeContractCall` -> wait for receipt -> wait for finality (2 confirmations, documented testnet policy) -> verify Governor state -> `GOVERNOR_EXECUTION_CONFIRMED` -> prove idempotency by replaying the identical request. Does not verify the economic postcondition (explicitly Gate 6's job) and does not produce `FULFILLED_VERIFIED`.
15. `scripts/gate6-verify-economic-postcondition.ts` — the one proven, real, end-to-end postcondition verification and receipt generation, run entirely after the fact against already-settled chain state: `buildProposalActionContext` -> `ERC20TransferAdapter.snapshot/deriveExpected/verify` -> `reconcileForMarkedReceipt` -> `MarkedReceipt`/`computeReceiptHash`.
16. `apps/web/src/app/proof/[id]/page.tsx` — an explicit, pre-existing `TODO(future gate): render from job once a live path can reach FULFILLED_VERIFIED` on the exact branch this task activates.
17. `packages/core/src/auth.ts` — `requireAuthenticatedActor`: a bearer-token check against `MARKED_DEMO_SESSION_TOKEN`, with no distinction between "a real operator" and "any visitor who opened a demo session" (`enterDemoWorkspace` is itself unauthenticated and public). Directly relevant: this is the auth boundary that would sit in front of a real KeeperHub write if enabled.
18. `packages/config/src/env.ts` — confirmed, again, not wired into any runtime path; every new env read in this task follows the same direct-`process.env` pattern every existing consuming module already uses.
19. `packages/postconditions/src/erc20-transfer-adapter.ts` — `verify()` requires **both** a matching balance delta **and** a matching execution-bound `Transfer` log before calling anything `EXACT_MATCH`; a balance-only match is deliberately insufficient (caught by this task's own test-fixture bug during development — see below).
20. Production storage (`MARKED_STORAGE_DRIVER`/`DATABASE_URL`) — could not be inspected: this session has no access to the live Vercel project's configured environment variables (no Vercel CLI/API credential available in this environment). Reported as unknown in the final report rather than assumed.

## Resulting architecture

```
Browser
  | authenticated request naming only a jobId
  v
Server Action / API route (apps/web/src/app/app/actions.ts, .../api/fulfillment/{prepare,approve,reconcile})
  | routes recovery-sandbox jobs to the OLD approveJob (never KeeperHub) at this one call site
  v
apps/web/src/lib/execution/prepare.ts          apps/web/src/lib/execution/approve-and-execute.ts
  ARMED -> ... -> AWAITING_APPROVAL             AWAITING_APPROVAL -> ... -> FULFILLED_VERIFIED
  (rebuilds the call from job.commitment;        (rebuilds the call from job.commitment; full
   never trusts a client-supplied target/         pre-broadcast revalidation BEFORE calling
   calldata/value — there is no such field         approveFulfillmentJob, since the state machine
   on the request at all)                          has no edge from EXECUTING back to a refusal)
  | simulateContractCall only                    | executeContractCall gated by
  v                                                 MARKED_ENABLE_KEEPERHUB_EXECUTION (default off)
apps/web/src/lib/execution/keeperhub-config.ts (server-only; KEEPERHUB_API_KEY never reaches the client bundle)
  v
KeeperHub (packages/keeperhub, unmodified)
  v
Blockchain (Sepolia only, via the one source-verified governor; mainnet additionally requires ENABLE_MAINNET_WRITE=true)
```

## Why the revalidation happens before EXECUTING, not after (a deliberate deviation from the gate5 script's ordering)

`scripts/gate5-keeperhub-execute.ts` records approval (entering `EXECUTING` in its own in-memory, throwaway store) and only afterward performs the full Part-9 revalidation; on a revalidation failure it simply logs and exits, leaving the ephemeral job "stuck" at `EXECUTING` with zero real consequence, since nothing ever reads that store again.

A real, durable, concurrent, user-facing job cannot do that safely: `EXECUTING`'s only legal outgoing edges in the unmodified state machine are `RECONCILING`, `UNKNOWN_RECONCILING`, and `DUPLICATE_SUPPRESSED` — there is no edge back to any refusal state. Adding one would be a state-machine redesign, which this task was explicitly told not to perform. The fix: `approveAndExecuteJob` runs the *entire* Gate-5-Part-9 revalidation (lifecycle, authorization, policy, simulation + caller-compatibility) **while the job is still `AWAITING_APPROVAL`**, and only calls the unmodified `approveFulfillmentJob` once every check has already passed. A caught problem simply never enters `EXECUTING` — the job stays at `AWAITING_APPROVAL` with a clear reason, and the human can disarm or retry. Same checks, same functions, same relative order to each other — reordered only relative to the state write, and only because a one-shot forensic script's ordering doesn't transfer safely to a persistent app.

## Idempotency and unknown-broadcast handling

- **Before dispatch:** `store.tryClaimExecution(requestHash, jobId, actor)` (Gate 7's CAS, previously unused) is the primary, fast, local dedup — a second concurrent caller for the same request is told plainly it lost the race (`ConcurrentJobModificationError`, surfaced as HTTP 409) rather than silently retried.
- **At the network boundary:** `executeContractCall` always sends KeeperHub's own `Idempotency-Key` header (`hashContractCall(call)`), proven safe to replay by Gate 5's own idempotency-replay proof — a second, independent safety net even if the local claim were somehow bypassed.
- **On a thrown error from `executeContractCall`** (network failure, ambiguous response): the job moves to `UNKNOWN_RECONCILING`, never retried automatically. `continueReconciliation` (a separate, non-dispatching function) is the only way forward, matching the mandate's explicit "unknown after broadcast = reconcile, not resend."
- **Resumability:** `continueReconciliation` picks up from whatever durable status the job currently holds (`EXECUTING`/`RECONCILING`/`UNKNOWN_RECONCILING`/`WAITING_FINALITY`/`VERIFYING_GOVERNOR_STATE`/`VERIFYING_POSTCONDITION`) and never calls `executeContractCall` — safe to call after a server restart, a client timeout, or a "Refresh status" click.
- **One honestly-acknowledged narrow gap** (KEEPERHUB-WIRING-002, finding 1's sibling): if a crash happens in the few milliseconds between recording approval (entering `EXECUTING`) and successfully calling `tryClaimExecution` — before any network I/O — `continueReconciliation` correctly detects and reports this exact stuck state ("dispatch never started... requires manual/operator intervention") rather than misreporting it as "reconciling," but cannot itself resume it, since resuming would mean dispatching, which this function is deliberately barred from doing.

## Test-development note: a real fixture bug caught by the adapter's own strictness

While writing the mocked test suite, an initial fake chain client returned empty transaction logs. `ERC20TransferAdapter.verify` (Gate 3, unmodified) correctly refused to call this `EXACT_MATCH` even though the balance delta was right — by design, a balance-only match is insufficient without a matching execution-bound `Transfer` log. This is not a defect; it is the adapter's own "narrow support proven correct beats broad support that quietly lies" philosophy catching a lazy test fixture. Fixed by building a real, decodable `Transfer` log in the test fixture (`apps/web/src/lib/execution/test-fixtures.ts`), not by weakening the adapter or the test's assertions.

## Verification

- `pnpm typecheck` — clean, all 11 workspace projects.
- `pnpm lint` — clean, zero warnings.
- `pnpm test` — 703 passed, 7 explicitly skipped (2 Postgres live-test files, 5 Cactus live-network tests, both opt-in gated, neither newly affected), 0 failed. +25 from this task (`apps/web/src/lib/execution/{prepare,approve-and-execute}.test.ts`).
- `pnpm build` — clean; the three new API routes (`/api/fulfillment/{prepare,approve,reconcile}`) and both modified pages compile and register as dynamic (`ƒ`) correctly.
- `pnpm verify:gate6` — could not complete: the free/configured Sepolia RPC endpoint returned `"state at block #11716393 is pruned"` for the historical `balanceOf` read this script performs, both with and without a real `SEPOLIA_RPC_URL` loaded from `.env.local`. This is a live-infrastructure archive-retention issue (real time has passed since the block was current), not a code regression — confirmed via `git diff`, which shows `scripts/gate6-verify-economic-postcondition.ts`, `packages/core/src/hash-domains.ts`, and `packages/core/src/receipt.ts` completely untouched by this task, and `evidence/marked-receipt/proof.json`/`receipt.json` (which hold the actual `receiptHash`) were never written by the failed run — the last-verified `receiptHash` (`0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`, confirmed in Gate 12) stands unchanged.
- `pnpm verify:historical` — all 353-record statistics match the committed Gate 8 baseline exactly.
- Secret scan — see the final report; same discipline as every prior gate (real `DATABASE_URL`/API keys never typed literally, verified via `grep -F` on a shell-loaded variable, full-history pickaxe search before commit).
- **0 new blockchain writes** — every new file is TypeScript/Markdown; `MARKED_ENABLE_KEEPERHUB_EXECUTION` was never set to `true` in this environment; every execution-path test uses a mocked KeeperHub `fetchImpl` and a mocked chain client (`setClientOverrideForTests`), never a real network call.
