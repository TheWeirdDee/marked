# Gate 7 Part 16 — recovery scenarios A-I

Each scenario below names the classifying function/mechanism, its test coverage, and — where relevant —
which prior gate's engine it deliberately reuses rather than re-implements.

## A — crash before submission

**Mechanism:** `classifyRestartRecovery` (`packages/core/src/recovery.ts`) + `SqliteFulfillmentJobStore`.
A job persisted at any pre-`EXECUTING` status (`PRE_EXECUTION_STATUSES`) is safe to resume with no special
handling — nothing was submitted, so there is nothing to reconcile.
**Proof:** `recovery.test.ts` "classifyRestartRecovery" describe block; live restart proof
(`live-restart-proof.md`) demonstrates an `ARMED` job surviving a real process kill with zero KeeperHub
calls having occurred.

## B — crash immediately after KeeperHub submission

**Mechanism:** `classifyExecutionRecovery` (`packages/core/src/recovery.ts`). If a persisted execution
identity exists (the deterministic request hash, Gate 5's idempotency pattern), recovery enters
`RECONCILING`/`UNKNOWN_RECONCILING` — never re-derives a new identity.
**Proof:** `recovery.test.ts` "classifyExecutionRecovery" describe block, `mayResubmit` asserted `false`
in every case.

## C — KeeperHub timeout

**Mechanism:** Same `classifyExecutionRecovery`. A `null`/`"pending"`/`"unknown"` KeeperHub status with a
persisted identity returns `UNKNOWN_RECONCILING`, instructing the caller to query existing identity/chain
state — never to blindly resubmit (BUILD_CONTRACT.md law 52, already established in Gate 5, extended here
to the restart case specifically).
**Proof:** `recovery.test.ts` covers `keeperHubStatus: null` and `"unknown"` inputs explicitly.

## D — KeeperHub says completed but receipt unknown

**Mechanism:** Same `classifyExecutionRecovery`. `keeperHubStatus: "completed"` with `hasTransactionHash:
false` or `hasConfirmedReceipt: false` stays `RECONCILING`/`UNKNOWN_RECONCILING` — a status string alone is
never sufficient (the same discipline as Gate 6's DEC-020, applied one layer earlier).
**Proof:** `recovery.test.ts` dedicated case.

## E — receipt exists but Governor not executed

**Mechanism:** Deliberately *not* re-implemented here. Gate 6's `reconcileForMarkedReceipt`
(`packages/core/src/receipt.ts`) already classifies this exact case via its `GOVERNOR_NOT_EXECUTED`
reconciliation-failure code — one of its six required legs. Duplicating that logic in `recovery.ts` would
risk the two classifiers silently drifting apart over time.
**Proof:** `packages/core/src/receipt.test.ts` (Gate 6, unchanged, 16/16 passing).

## F — Governor executed externally while Marked was offline

**Mechanism:** `classifyExternalExecutionRecovery`. Structurally excludes calling KeeperHub again:
`callKeeperHub` is typed as the literal `false`. If eligibility resolves to `ALREADY_EXECUTED`, the
function reports `proceedToVerification: true` when a transaction hash is already known (so verification —
Gate 6's engine — can still run) and `false` otherwise (nothing to verify against yet).
**Proof:** `recovery.test.ts` "classifyExternalExecutionRecovery" describe block, both with and without a
known tx hash.

## G — economic verification fails after successful Governor execution

**Mechanism:** Deliberately *not* re-implemented here, same reasoning as E. Gate 6's state machine already
has a named non-`FULFILLED_VERIFIED` terminal for exactly this case: `VERIFYING_POSTCONDITION →
FULFILLED_UNVERIFIED` (see `status.ts`, `fulfillment-state-machine.ts`'s `UNCONDITIONAL_EDGES`). A Governor
execution succeeding does not imply the postcondition will.
**Proof:** `fulfillment-state-machine.test.ts` (Gate 4, unchanged) — the `VERIFYING_POSTCONDITION →
FULFILLED_UNVERIFIED` edge is one of the table's proven legal transitions.

## H — reorg / finality regression

**Mechanism:** `classifyFinalityRegression`. Compares a previously-observed block hash at a given height
against the current chain's block hash at that same height. Any mismatch (including `null`, meaning the
block disappeared entirely) returns `action: "REVERT_TO_RECONCILING"` — a prior `FINALITY_HOLDS`
observation is never trusted as permanent without re-checking.
**Proof:** `recovery.test.ts` "classifyFinalityRegression" describe block — matching hash → `FINALITY_HOLDS`;
differing or `null` hash → `REVERT_TO_RECONCILING`.

## I — duplicate worker

**Mechanism:** `resolveDuplicateWorkerOutcome` (pure classifier) + `SqliteFulfillmentJobStore.tryClaimExecution`
(the actual storage-level compare-and-set: `execution_claims.request_hash` is a `PRIMARY KEY`, so a second
worker's `INSERT` fails with a real constraint violation, caught and turned into `{claimed: false,
existingClaimJobId}`).
**Proof:** `recovery.test.ts` covers the pure resolver; `sqlite-fulfillment-job-store.test.ts` proves the
real compare-and-set with two live store instances racing on the same on-disk file — only one claim
succeeds, confirmed by both the return value and a direct `getExecutionClaim` re-read.
**Honesty boundary:** this is single-node (one SQLite file) locking. Marked does not claim
distributed/multi-node production locking — see `CLAIMS.md`.

## Summary table

| Scenario | Classifier | New this gate? | Test file |
|---|---|---|---|
| A | `classifyRestartRecovery` | Yes | `recovery.test.ts` |
| B/C/D | `classifyExecutionRecovery` | Yes | `recovery.test.ts` |
| E | `reconcileForMarkedReceipt` | No — Gate 6 | `receipt.test.ts` |
| F | `classifyExternalExecutionRecovery` | Yes | `recovery.test.ts` |
| G | state machine's `FULFILLED_UNVERIFIED` edge | No — Gate 4 | `fulfillment-state-machine.test.ts` |
| H | `classifyFinalityRegression` | Yes | `recovery.test.ts` |
| I | `resolveDuplicateWorkerOutcome` + `tryClaimExecution` | Yes | `recovery.test.ts` + `sqlite-fulfillment-job-store.test.ts` |
