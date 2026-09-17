# Gate 12 §6/§7/§8/§9/§10 — authorization integrity, state-machine, concurrency, idempotency, unknown-broadcast recovery

## §6 — Authorization integrity audit

Attempted (by direct code reading, not live mutation — mutating a real Governor's onchain state is out of this zero-write gate's scope) to find any path from a mutated Cactus/user input to an executable approved plan:

- **chainId/Governor/proposalId mutation**: `refreshAuthorizationHash` (`apps/web/src/lib/governance.ts`) re-derives the authorization hash from the job's own `commitment.chainId`/`commitment.governor`/`commitment.proposalId` at ARM time — there is no code path where a client-supplied value for any of these fields is used instead of the value already frozen into the commitment at resolution time. The commitment itself is only ever constructed by `toGovernanceCoordinate`/`ensureReviewReadyJob`, both fed exclusively by a successfully-resolved Cactus proposal (§14/§15 below) or the Gate 5 evidence fixture — never by raw request body fields.
- **action order/index/target/value/calldata/signature**: `armFulfillmentJob` recomputes `computeFulfillmentCommitmentHash(reviewedCommitment)` and compares it byte-for-byte against `job.fulfillmentCommitmentHash` — any mutation to any field inside the commitment changes the hash and throws `ArmRefusedError("COMMITMENT_HASH_MISMATCH")` before arming. This is the same mechanism Gate 4's original mutation-testing already covered exhaustively (`packages/core/src/fulfillment-job.test.ts`), re-spot-checked this gate, still passing.
- **authorization hash itself**: compared against the LIVE re-read (`currentAuthorizationHash !== reviewedCommitment.frozenActionAuthorizationHash` → `ArmRefusedError("AUTHORIZATION_CHANGED")`), not merely against the frozen value's own copy of itself (which would be tautological) — confirmed by reading the call site: `refreshAuthorizationHash` performs a fresh RPC read, independent of `job.commitment`.
- **stale-state race (review A → change to B → attempt ARM)**: structurally impossible to reach ARMED with stale authorization, because the live re-read happens at ARM time, not at review/resolution time — there is no cached "was valid a moment ago" path.

**Result: no mutation path found that reaches an executable approved plan without deterministic rejection.** This reuses and re-confirms Gate 4/5's original mutation-testing rather than re-deriving it from scratch — see `packages/core/src/fulfillment-job.test.ts` for the exhaustive per-field test list.

## §7 — State-machine audit

Full transition table: `packages/core/src/fulfillment-state-machine.ts` (`UNCONDITIONAL_EDGES` + `CONDITIONAL_EDGES`). TypeScript's `Record<FulfillmentStatus, ...>` type already structurally guarantees every status has an entry (a missing key is a compile error) — confirmed by `pnpm typecheck` passing.

New this gate: a real breadth-first reachability test (`fulfillment-state-machine.test.ts`, "every declared status is reachable from NEW") — walks the actual transition table (both `fulfillmentMode` contexts) starting at `NEW` and asserts every status in `ALL_FULFILLMENT_STATUSES` is visited. **Passed — zero orphan states.**

Already-existing coverage (re-run, still passing, not re-derived): every terminal status has zero legal outgoing edges (programmatically enumerated over `TERMINAL_STATUSES`, except the documented `REFUSAL_TIMELOCK_PENDING` "waiting, not dead" exception, which has exactly one edge back to `WAITING_ELIGIBILITY`); the only legal predecessor of `FULFILLED_VERIFIED` is `VERIFYING_POSTCONDITION`; `DISARMED_BY_USER` is legal only from `ARMED`/`WAITING_ELIGIBILITY`/`ELIGIBLE`/`AWAITING_APPROVAL` and illegal from every post-broadcast state (`EXECUTING`/`RECONCILING`/`WAITING_FINALITY`/`VERIFYING_GOVERNOR_STATE`/`VERIFYING_POSTCONDITION`) — programmatically checked, not merely asserted for a couple of examples.

**No duplicate terminal-success state**: `isMarked()` checks only `status === "FULFILLED_VERIFIED"`; no other status/helper claims to represent "marked."

**Result: 44/44 state-machine tests pass, including the new reachability check. No gap found.**

## §8 — Concurrency audit

Audited every state-changing operation in the live web app for TOCTOU (SELECT → decision → UPDATE without an atomic guard):

| Operation | Before this gate | After |
|---|---|---|
| ARM | `saveJobAndEvents` (unconditional upsert) — **real TOCTOU gap found, F-01** | `saveWithCas(nextJob, [event], job.status)` |
| DISARM | Same gap | Same fix |
| APPROVE | Same gap | Same fix |
| Execution claim (`tryClaimExecution`) | Real PRIMARY-KEY-based CAS (Gate 7), proven sound by genuine concurrent-race tests (Gate 7/11) | Unchanged — currently unreachable from the live app (F-06), so this gate did not need to touch it |
| Job-level CAS (`saveWithCas` itself) | Built and proven in Gate 11, but never called by application code | Now genuinely load-bearing (F-01's fix) |

**ARM+ARM / ARM+DISARM / APPROVE+DISARM / APPROVE+APPROVE**: reproduced for real with two genuinely independent `SqliteFulfillmentJobStore` instances racing via `Promise.all` (never sequential awaits) — see `apps/web/src/lib/fulfillment-actions.test.ts`. Before the fix: both racing calls "succeeded," producing a duplicate event or a silently-overwritten outcome. After: exactly one wins, the other receives `ConcurrentJobModificationError`.

**Execution claim + execution claim**: already proven (Gate 7/11, re-confirmed this gate by re-reading `sqlite-fulfillment-job-store.test.ts`'s "simulates two concurrent workers racing for the same job" test, still passing) — exactly one of two genuinely independent store instances racing `tryClaimExecution` for the same request hash claims it.

**Execution claim + external execution discovery, reconciliation + retry, verification + reorg handling**: these require a live KeeperHub/RPC race that this zero-write, offline-scripts-only-for-execution audit could not safely construct against real infrastructure. Documented as **not exercised this gate** rather than claimed proven.

## §9 — Idempotency audit

Traced identity through the chain: Marked job (`jobId`, deterministic via `jobIdForCoordinate(chainId, governor, proposalId)` — re-resolving the same proposal always finds the same job, confirmed by `ensureReviewReadyJob`'s get-or-create logic, never overwriting an already-armed job back to `REVIEW_READY`) → fulfillment commitment (hash-pinned, re-verified at every ARM) → execution claim (`request_hash` PRIMARY KEY) → KeeperHub `Idempotency-Key` (derived from `hashContractCall(call)` — the same call always produces the same key, `packages/keeperhub/src/client.ts:135,148`) → tx hash → Governor proposal state → Marked receipt (hash-pinned, mutation-tested).

**Same HTTP action twice / browser double-click / client timeout+retry / server action replay**: covered by F-01's fix (CAS refuses the second write from a stale snapshot) for the pre-execution mutations. **Two Vercel instances / process restart / same KeeperHub key / different key for same job**: the execution-claim CAS (Gate 7/11, real primary-key-based) is the mechanism designed to cover this, but is currently unreachable from the live app (F-06) — so this project makes no live claim about it beyond "implemented and proven in isolation."

**This audit does not claim exactly-once execution semantics.** It confirms: (a) the pre-execution state machine now has real duplicate-suppression where it previously didn't (F-01), (b) the execution-claim layer has real duplicate-suppression proven in isolation, (c) the live app does not currently exercise the execution-claim layer at all, because it does not currently trigger execution at all (F-06).

## §10 — Unknown-outcome / broadcast-gap audit

`UNKNOWN_RECONCILING` exists as a first-class named status in the state machine (`status.ts`), reachable from both `EXECUTING` and `RECONCILING` (confirmed by the reachability test above), with a legal path forward to `RECONCILING`/`WAITING_FINALITY` — i.e. the state machine's own shape already encodes "broadcast outcome unknown → reconcile, do not silently retry with a fresh identity" as the intended design (PRD-level decision, not new this gate).

**This gate could not exercise this path live** — doing so would require actually calling KeeperHub (explicitly forbidden: zero blockchain writes) and simulating a real network failure mid-broadcast against it. What was verified: the state machine structurally has no edge from `EXECUTING`/`RECONCILING`/`UNKNOWN_RECONCILING` back to a state that would re-attempt execution with a NEW identity — re-attempts, if the application code ever implements them, would necessarily reuse the same job's execution-claim (`request_hash`), which is itself real-CAS-protected. Whether the application code that would drive this reconciliation loop actually exists and is correct is **not claimed proven** — grep confirms no code in `apps/web/src` currently drives a job through `RECONCILING`/`WAITING_FINALITY` at all (consistent with F-06: the live app never starts a real execution to reconcile).

**Status: documented, not exercised. This is an honest gap, not a hidden one** — the reconciliation logic this gate would need to test does not appear to exist yet in the live app; only the state machine's shape (which permits it) does.
