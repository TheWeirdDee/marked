# Gate 4 adversarial test matrix

Mapped directly to Gate 4 instructions §12's 30 required cases. All PASS as of 2026-09-15 (`pnpm --filter @marked/core test`, `pnpm --filter @marked/postconditions test`, `pnpm --filter @marked/db test`).

| # | Case | Test location | Result |
|---|---|---|---|
| 1 | Deterministic fulfillment commitment reproduction | `fulfillment-commitment.test.ts` "determinism" (repeated calls, deep clone) | PASS |
| 2 | Property-order independence | `fulfillment-commitment.test.ts` "is unaffected by JS object key order" | PASS |
| 3 | Chain mutation changes hash | `fulfillment-commitment.test.ts` "changes when chainId changes" | PASS |
| 4 | Governor mutation changes hash | `fulfillment-commitment.test.ts` "changes when governor changes" | PASS |
| 5 | proposalId mutation changes hash | `fulfillment-commitment.test.ts` "changes when proposalId changes" | PASS |
| 6 | actionAuthorizationHash mutation changes hash | `fulfillment-commitment.test.ts` "changes when frozenActionAuthorizationHash changes" | PASS |
| 7 | Action selection/order mutation changes hash | `fulfillment-commitment.test.ts` "changes when selectedActionIndexes content/order changes" | PASS |
| 8 | Adapter version mutation changes hash | `fulfillment-commitment.test.ts` "changes when a postcondition binding's adapterVersion changes" | PASS |
| 9 | Token mutation changes hash | `fulfillment-commitment.test.ts` "changes when a postcondition binding's bindingParams token value changes" | PASS |
| 10 | Recipient mutation changes hash | `fulfillment-commitment.test.ts` "...recipient value changes" | PASS |
| 11 | Raw amount ±1 changes hash | `fulfillment-commitment.test.ts` "...rawAmount changes by exactly 1" | PASS |
| 12 | APPROVE vs AUTO changes commitment where intended | `fulfillment-commitment.test.ts` "changes when fulfillmentMode changes" | PASS |
| 13 | Lifecycle ETA change does NOT alter frozen action authorization | Gate 2's `resolve.test.ts` lifecycle-separation test (unchanged, re-verified in this gate — `actionAuthorizationHash` and `FulfillmentCommitment` are structurally separate objects; the commitment only ever references the hash, never lifecycle fields) | PASS |
| 14 | Invalid state transition rejected | `fulfillment-state-machine.test.ts` — explicit §6 examples (NEW→EXECUTING, ARMED→FULFILLED_VERIFIED, SIMULATING→FULFILLED_VERIFIED, DISARMED_BY_USER→EXECUTING, REFUSAL_CANCELED→EXECUTING) | PASS |
| 15 | Skipping authorization state rejected | `fulfillment-state-machine.test.ts` "skipping AUTHORIZATION_RESOLVED (NEW -> POSTCONDITION_BOUND) is rejected" | PASS |
| 16 | Skipping postcondition binding rejected | `fulfillment-state-machine.test.ts` "skipping POSTCONDITION_BOUND (AUTHORIZATION_RESOLVED -> REVIEW_READY) is rejected" | PASS |
| 17 | Direct ARMED -> EXECUTING without eligibility/simulation rejected | `fulfillment-state-machine.test.ts` "ARMED -> EXECUTING directly... is rejected" | PASS |
| 18 | Direct ARMED -> FULFILLED_VERIFIED rejected | `fulfillment-state-machine.test.ts` "ARMED -> FULFILLED_VERIFIED directly is rejected" | PASS |
| 19 | Disarmed commitment cannot execute | `fulfillment-job.test.ts` "a disarmed job cannot execute" + `fulfillment-state-machine.test.ts` DISARMED_BY_USER terminal-state check | PASS |
| 20 | Canceled proposal cannot execute | `fulfillment-state-machine.test.ts` exhaustive terminal-status check covers `REFUSAL_CANCELED` (zero outgoing edges) | PASS |
| 21 | Approval for hash A rejected for hash B | `fulfillment-job.test.ts` "rejects an approval given for a different commitment hash" | PASS |
| 22 | Stale reviewed commitment rejected at arm | `fulfillment-job.test.ts` "refuses when the reviewed commitment does not hash to the job under review" | PASS |
| 23 | Postcondition manual override mismatch rejected | `postcondition-binding.test.ts` "rejects a human-supplied recipient/amount that disagrees with the authoritative...value" | PASS |
| 24 | Unsupported action prevents arm | `fulfillment-job.test.ts` "refuses when postcondition coverage is UNSUPPORTED" | PASS |
| 25 | PARTIAL bundle prevents arm | `fulfillment-job.test.ts` "refuses when postcondition coverage is PARTIAL" | PASS |
| 26 | Restart/reload preserves exact commitment | `fulfillment-job-store.test.ts` "a snapshot round-tripped into a brand-new store instance preserves the job and its full event history byte-for-byte" | PASS |
| 27 | Event history remains ordered and append-only | `fulfillment-job-store.test.ts` "event order is preserved exactly as appended" + "exposes no update or delete method for events" | PASS |
| 28 | No KeeperHub network write occurs during arm | `fulfillment-job.test.ts` "none of arm/disarm/approve are async — structurally impossible... to perform network I/O" | PASS |
| 29 | No local broadcaster exists | Same as #28 — `armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob` take no client/provider parameter of any kind and are synchronous | PASS |
| 30 | No route can manufacture MARKED ✓ | `fulfillment-job.test.ts` "no route can manufacture MARKED ✓" (3 tests: arm/disarm/approve each individually proven to never return `FULFILLED_VERIFIED`) + `fulfillment-state-machine.test.ts` "the only legal predecessor of FULFILLED_VERIFIED is VERIFYING_POSTCONDITION" | PASS |

## Additional mutation coverage beyond the required 30

- `computePostconditionBindingHash` mutation sensitivity (actionIndex, adapterId, required, bindingParams order) — `fulfillment-commitment.test.ts`.
- Domain non-collision: `MARKED_FULFILLMENT_COMMITMENT_V1`, `MARKED_POSTCONDITION_BINDING_V1`, and Gate 2's `MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1` are all pairwise distinct — `fulfillment-commitment.test.ts`.
- Exhaustive terminal-status check: every status in `TERMINAL_STATUSES` (except the documented `REFUSAL_TIMELOCK_PENDING` exception) has zero legal outgoing edges to any of the other 35 statuses, under all three mode contexts (omitted/AUTO/APPROVE) — `fulfillment-state-machine.test.ts`.
- Full happy-path walkability: `NEW` → ... → `FULFILLED_VERIFIED` is proven legal hop-by-hop under APPROVE mode, and the AUTO-mode `SIMULATING → EXECUTING` shortcut is proven legal while the wrong-mode branch is proven illegal in both directions — `fulfillment-state-machine.test.ts`.
- `armFulfillmentJob` does not mutate its input job on refusal — `fulfillment-job.test.ts`.
- `disarmFulfillmentJob` illegal-late-disarm proven across four separate post-broadcast states (`EXECUTING`, `RECONCILING`, `WAITING_FINALITY`, `FULFILLED_VERIFIED`), not just one.
