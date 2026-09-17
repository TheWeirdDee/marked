# State machine, arm, disarm, approval semantics

Defined in `packages/core/src/fulfillment-state-machine.ts` (transition legality) and `packages/core/src/fulfillment-job.ts` (arm/disarm/approve domain operations). Statuses reuse the exact names already defined in `packages/core/src/status.ts` (Gate 0) — no duplicate or contradictory naming was introduced.

## Transition table

```text
NEW ────────────────► CACTUS_RESOLVED ─────► CACTUS_RESOLUTION_FAILED (terminal)
                            │
                            ▼
                   AUTHORIZATION_RESOLVED ──► AUTHORIZATION_RESOLUTION_FAILED (terminal)
                            │
                            ▼
                    POSTCONDITION_BOUND ────► POSTCONDITION_UNSUPPORTED (terminal)
                            │
                            ▼
                      REVIEW_READY
                            │
                            ▼
                          ARMED ───────────────────────────────► DISARMED_BY_USER (terminal)
                            │
                            ▼
                  WAITING_ELIGIBILITY ◄──┐ ──► REFUSAL_TIMELOCK_PENDING (loops back, "waiting not dead")
                            │            │ ──► REFUSAL_CANCELED / REFUSAL_NOT_EXECUTABLE (terminal)
                            │            │ ──► DISARMED_BY_USER (terminal)
                            └────────────┘
                            ▼
                         ELIGIBLE ────────────────────────────────► DISARMED_BY_USER (terminal)
                            │
                            ▼
                  VERIFYING_LIFECYCLE ──► REFUSAL_CANCELED / REFUSAL_NOT_EXECUTABLE /
                            │             REFUSAL_TIMELOCK_PENDING / FULFILLED_EXTERNALLY_VERIFIED /
                            │             FULFILLED_EXTERNALLY_UNVERIFIED   (all terminal)
                            ▼
                 VERIFYING_AUTHORIZATION ──► REFUSAL_PAYLOAD_MISMATCH (terminal)
                            │
                            ▼
                   CAPTURING_PRESTATE
                            │
                            ▼
                        SIMULATING ──► REFUSAL_SIMULATION_REVERT / BLOCKED_INSUFFICIENT_GAS /
                            │          REFUSAL_WORKFLOW_POLICY_VIOLATION / BLOCKED_CALLER_NOT_AUTHORIZED /
                            │          DUPLICATE_SUPPRESSED   (all terminal)
                 ┌──────────┴──────────┐
        mode=APPROVE                mode=AUTO
                 ▼                       │
        AWAITING_APPROVAL ──► DISARMED_BY_USER (terminal)
                 │                       │
                 └───────────┬───────────┘
                              ▼
                          EXECUTING ──► RECONCILING / UNKNOWN_RECONCILING / DUPLICATE_SUPPRESSED (terminal)
                              │
                              ▼
                          RECONCILING ◄──► UNKNOWN_RECONCILING
                              │
                              ▼
                       WAITING_FINALITY
                              │
                              ▼
                  VERIFYING_GOVERNOR_STATE
                              │
                              ▼
                  VERIFYING_POSTCONDITION ──► FULFILLED_UNVERIFIED (terminal)
                              │
                              ▼
                       FULFILLED_VERIFIED  ("MARKED ✓", terminal)
```

The full adjacency table lives in code (`UNCONDITIONAL_EDGES`, `CONDITIONAL_EDGES`), each edge commented with its product justification. `isLegalTransition`/`transition` are the only functions that may produce a new status — assigning a status string elsewhere in application code is not itself a valid transition.

## The one mode-dependent branch

`SIMULATING` has two legal successors, gated by `TransitionContext.fulfillmentMode`:
- `SIMULATING → AWAITING_APPROVAL` — legal only when `fulfillmentMode === "APPROVE"`.
- `SIMULATING → EXECUTING` — legal only when `fulfillmentMode === "AUTO"`.

Omitting the mode context makes **both** branches illegal — an ambiguous mode is never silently resolved to either path (proven in `fulfillment-state-machine.test.ts`).

## `REFUSAL_TIMELOCK_PENDING` — the one non-terminal "terminal" status

Per `status.ts`'s own `WAITING_NOT_DEAD_STATUSES` documentation, this status has exactly one legal outgoing edge: back to `WAITING_ELIGIBILITY`, for the next eligibility recheck. It is the sole documented exception to "every status in `TERMINAL_STATUSES` has zero outgoing edges" — proven exhaustively in `fulfillment-state-machine.test.ts` by iterating every terminal status against every other status and every mode context.

## Arm semantics

`armFulfillmentJob` (`packages/core/src/fulfillment-job.ts`) enforces every one of Gate 4 instructions §7's eight requirements:

1. **Current Governor authorization is resolved** — the caller supplies a freshly-read `currentAuthorizationHash`; arming itself performs no network I/O (it is a synchronous function).
2. **Current authorization hash equals the hash being armed** — checked against `reviewedCommitment.frozenActionAuthorizationHash`; mismatch → `ArmRefusedError("AUTHORIZATION_CHANGED")`.
3. **Required postcondition coverage is FULL** — checked against caller-supplied `currentPostconditionCoverage`; anything else → `ArmRefusedError("POSTCONDITION_COVERAGE_INCOMPLETE" | "POSTCONDITION_UNSUPPORTED")`.
4. **Supported postcondition semantics are bound** — structural: `reviewedCommitment.postconditionBindings` must already exist (built via an adapter's own binding function, e.g. `buildErc20TransferBinding`).
5. **Fulfillment commitment is computed** — `computeFulfillmentCommitmentHash(reviewedCommitment)` is recomputed and compared byte-for-byte against `job.fulfillmentCommitmentHash`; mismatch → `ArmRefusedError("COMMITMENT_HASH_MISMATCH")` (the "stale reviewed commitment" case).
6. **Human mode is selected** — `FulfillmentCommitment.fulfillmentMode` is a required, non-optional field.
7. **Immutable commitment is persisted** — the caller's `FulfillmentJobStore.save()` call, after `armFulfillmentJob` returns.
8. **State moves to ARMED** — via `transition()`, itself fail-closed.

No KeeperHub call, no network I/O: `armFulfillmentJob` is synchronous — a structural proof, not merely an untested claim, that arming cannot perform a write.

## Disarm semantics

`disarmFulfillmentJob` requires `actor`, `now`, and an optional `reason`, and is legal only from `ARMED`, `WAITING_ELIGIBILITY`, `ELIGIBLE`, or `AWAITING_APPROVAL` — i.e. strictly before broadcast begins. From any later state (`EXECUTING` onward) it throws `IllegalDisarmError`: once execution has begun, disarm cannot pretend to cancel the chain transaction (PRD J7.1). Every disarm produces a `DisarmEvent` recording `actor`, `timestamp`, the prior `fulfillmentCommitmentHash`, and `reason` (`null` if not supplied).

## Approval semantics

`approveFulfillmentJob` is legal only from `AWAITING_APPROVAL`, and requires the caller to supply the exact `fulfillmentCommitmentHash` being approved. If it does not match the job's current hash, `ApprovalHashMismatchError` is thrown — approval means "I approve this exact frozen commitment," never "execute whatever is current." A successful approval transitions `AWAITING_APPROVAL → EXECUTING` and produces an `ApprovalEvent`.

## MARKED ✓ cannot be manufactured

`armFulfillmentJob`, `disarmFulfillmentJob`, and `approveFulfillmentJob` can only ever produce `ARMED`, `DISARMED_BY_USER`, or `EXECUTING` respectively — none of them can produce `FULFILLED_VERIFIED`. Combined with the state machine's exhaustive proof that `VERIFYING_POSTCONDITION` is the only legal predecessor of `FULFILLED_VERIFIED`, and that no runtime code exists anywhere in this repository that drives a job through `EXECUTING → RECONCILING → WAITING_FINALITY → VERIFYING_GOVERNOR_STATE → VERIFYING_POSTCONDITION` (that orchestration is Gate 5+), `FULFILLED_VERIFIED`/`MARKED ✓` is unreachable through any code path that exists today.
