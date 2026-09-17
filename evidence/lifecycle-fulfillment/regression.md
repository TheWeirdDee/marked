# Cross-gate regression — Gate 5

Per Gate 5 instructions Part 22, re-run after all Gate 5 implementation and the live execution proof, 2026-09-16.

## Gate 2 — Compound #220 authorization hash unchanged

```text
0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d
```

`pnpm prove:governor` re-run — identical. `packages/governor` test suite: 64/64 passing (40 pre-existing + 24 new Gate 5 tests: 11 lifecycle-eligibility, 8 execution-plan, 5 caller-authority additions). No pre-existing governor test file was modified.

## Gate 3 — historical ERC20 fixture still reproduces

`pnpm prove:erc20-postcondition` re-run — identical result (`ADAPTER VERIFICATION: PASS`, `EXACT_MATCH`, same balances/delta as originally recorded). `packages/postconditions` test suite: 58/58 passing, unchanged.

## Gate 4 — fulfillment commitment example still reproduces

`pnpm prove:fulfillment-commitment` re-run — identical hash (`0x77c70a19f9a2910823e34416b30790c2e683bf2a889d02c414b211cc0fa49358`), and its own internal Gate 2 regression check also confirms unchanged. `packages/core` test suite: 124/124 passing, unchanged (Gate 5 added two new legal edges to the state machine — `VERIFYING_GOVERNOR_STATE → GOVERNOR_EXECUTION_CONFIRMED` and `GOVERNOR_EXECUTION_CONFIRMED → VERIFYING_POSTCONDITION` — and one new named status, `GOVERNOR_EXECUTION_CONFIRMED`; no existing edge, status, or test was modified, and all 124 pre-existing tests still pass unchanged).

## KeeperHub safety wrappers remain green

`packages/keeperhub` test suite: 66/66 passing (57 pre-existing Gate 1B tests, unmodified, + 9 new Gate 5 `lifecycle-execution-policy.test.ts` tests). No pre-existing KeeperHub test file was modified. Existing Gate 1B evidence (`evidence/keeperhub/`) was not touched — Gate 5's live proof reused `simulateContractCall`/`executeContractCall` as already-proven, unmodified functions; **no new exploratory KeeperHub schema discovery occurred**.

## No local broadcaster introduced

Confirmed by inspection: `armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob` remain synchronous with no client parameter (Gate 4, unchanged). The only place in this gate's new code with a real signing key is `gate5-deploy-and-queue.ts`, which uses the `GATE5_DEPLOYER_PRIVATE_KEY` test-fixture key **only** to deploy and bootstrap the controlled Governor stack (propose/vote/queue) — never to call `execute()`. The one and only `execute(proposalId)` call in this entire gate was submitted through KeeperHub (`gate5-keeperhub-execute.ts`), not signed locally.

## Full repository validation

`pnpm typecheck` ✓ (all workspaces) · `pnpm lint` ✓ · `pnpm test` ✓ 383/383 · `pnpm build` ✓.

## Test totals

| Package | Before Gate 5 | After Gate 5 |
|---|---|---|
| `packages/core` | 124 | 124 (2 new edges/1 new status added to existing files; test count unchanged, all existing tests still pass) |
| `packages/governor` | 40 | 64 |
| `packages/keeperhub` | 57 | 66 |
| `packages/postconditions` | 58 | 58 (unchanged) |
| `packages/db` | 10 | 10 (unchanged) |
| `packages/cactus` | 48 | 48 (unchanged) |
| `apps/cli` | 5 | 5 (unchanged) |
| `packages/config` | 8 | 8 (unchanged) |
| **Repo total** | **350** | **383** |
