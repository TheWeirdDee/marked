# Marked — Fulfillment Reference Model

This is a specification document, not a status report. It describes the deterministic reference model that production behavior is tested against (PRD v1.2 §2.6). It does not claim any of this is implemented yet — implementation status lives in `GATES.md` and `CLAIMS.md`.

Production tests compare observed behavior against this model. They do not invent expected statuses twice — a test asserting a transition must cite the rule below it is checking, not a locally re-derived expectation.

## Core invariant chain

```text
Cactus identifies.
Governor authorizes.
KeeperHub executes.
Marked verifies.
```

Each stage may only do the job assigned to it:

- **Cactus** resolves the human governance object — organization, title, chain, Governor address, onchain proposal ID. It never authorizes execution and its rendered calldata is never treated as authorization when Governor state is independently readable.
- **Governor** is the sole source of the authorized action bundle (targets, values, signatures/calldatas) and of lifecycle state (ETA, grace, current state).
- **KeeperHub** is the only execution runtime. It triggers, reads, conditions, simulates (or performs a real `eth_call` preflight where no blocking dry-run exists), signs via Turnkey, submits, and produces an audit trail. It never alters the frozen commitment.
- **Marked** canonicalizes, hashes, enforces policy, and independently verifies postconditions. It creates no governance authority of its own.

## Hash domains are separate on purpose

```text
action authorization hash != lifecycle snapshot
```

The action-authorization hash is computed over the canonical action bundle only:

```text
{ family, encoderVersion, chainId, governor, proposalId, targets[], values[], signatures[]?, calldatas[], descriptionHash? }
```

It deliberately excludes ETA, queued time, grace period, and current Governor state string. Those live in a separate, mutable `GovernorLifecycleSnapshot`. Legal lifecycle transitions (a proposal moving from Queued toward Executable as ETA approaches) must never change the action-authorization hash.

As of Gate 2, this is implemented, not just specified: `packages/core/src/hash-domains.ts` defines `GovernorBravoActionAuthorization` and `computeActionAuthorizationHash`, domain-separated and versioned via the literal constant `MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1`. `packages/governor/src/resolve.ts`'s `resolveGovernorAuthorization` reads a live Bravo proposal's action bundle via `getActions(proposalId)` and its lifecycle via `state`/`proposals`, in the same call, at the same pinned block — and still returns the two as separate typed objects. `packages/governor/src/resolve.test.ts` includes a dedicated test proving the same action bundle resolved at two different lifecycle states (different `state`/`eta`/block) produces an identical `actionAuthorizationHash`. See `evidence/governor/canonical-encoding.md` and `evidence/governor/mutation-tests.md` for the full design rationale and mutation-coverage proof.

A one-byte mutation to any element of `targets`, `values`, `signatures`, or `calldatas` **must** change the action-authorization hash. An ETA change **must not**.

## Bravo `execute(proposalId)` is not the action bundle

```text
Governor Bravo execute(proposalId)
is NOT the same object as
the proposal's inner targets/values/signatures/calldatas.
```

`execute(proposalId)` is a single-argument call whose calldata says nothing on its face about what it will do — the actual authorized effect lives in the Governor's `proposals[proposalId]` storage, readable only via the dedicated `getActions(proposalId)` view (Gate 2 confirmed, from Compound's own reference source, that Bravo's public `proposals` auto-getter omits every dynamic-array struct field — `targets`/`values`/`signatures`/`calldatas` are unreachable any other way; see `evidence/governor/bravo-methodology.md`). Marked's proof obligation is therefore in two parts, both required:

```text
A. frozenActionAuthorizationHash == currentGovernorActionAuthorizationHash
B. KeeperHub call target == expected Governor or Timelock entrypoint
C. KeeperHub args == expected stage args, e.g. execute(proposalId)
```

Satisfying only C — "the transaction called execute() and succeeded" — proves nothing about which action bundle it executed. Satisfying only A without B/C proves the DAO authorized something but does not prove KeeperHub sent the correct lifecycle call.

## Before any write

```text
frozenActionAuthorizationHash
==
currentGovernorActionAuthorizationHash
```

This equality is re-checked immediately before every write, not only once at ARM time (Invariant 28: "Authorization is recomputed immediately before write."). A mismatch fails closed — the job does not attempt to "repair" or reinterpret the authorized action; it refuses.

## The seam from authorization to economic proof

```text
Cactus human object
        ↓
Governor action authorization
        ↓
frozen actionAuthorizationHash
        ↓
authorized action semantics
        ↓
EconomicPostconditionAdapter
        ↓
expected economic state
```

As of Gate 3, this half of the seam is implemented and live-proven: `packages/core/src/economic-postcondition.ts` defines `ProposalActionContext` and the `EconomicPostconditionAdapter<TPre,TExpected,TObserved>` interface; `buildProposalActionContext` is the only sanctioned constructor, and it only accepts a real `GovernorAuthorizedAction` — so `target`/`signature`/`calldata` are always traceable back to Gate 2's authoritative action bundle, never independently supplied. `packages/postconditions/src/erc20-transfer-adapter.ts`'s `ERC20TransferAdapter` is the first (and, in Gate 3, only) proven adapter: it derives token/recipient/amount deterministically from that context, takes a block-pinned pre-state snapshot, and derives the expected post-state with pure bigint arithmetic — see `evidence/postconditions/erc20-transfer-methodology.md`.

The second half of the seam is now implemented and live-proven, as of Gate 5 (execution) and Gate 6 (verification and receipt):

```text
KeeperHub lifecycle execution
        ↓
observed economic state
        ↓
expected vs observed
        ↓
FULFILLED_VERIFIED
```

Gate 5's `execution-plan.ts`/`lifecycle-eligibility.ts`/`caller-authority.ts` build and validate the exact Governor lifecycle call and submit it through KeeperHub (Option B, `DEC-019`) — proven against a real controlled Sepolia Governor Bravo deployment (`evidence/lifecycle-fulfillment/`). Gate 6's `reconcileForMarkedReceipt` (`packages/core/src/receipt.ts`) is the terminal reconciliation gate: it requires the frozen authorization, the authorization recorded at execution time, and a freshly-re-resolved final authorization to all agree; the selected action index to match the postcondition binding; the Governor's final state to independently confirm `Executed`; and `ERC20TransferAdapter.verify()` (Gate 3, unmodified, re-run against fresh block-pinned reads) to independently confirm the exact economic effect — before the state machine may legally transition `GOVERNOR_EXECUTION_CONFIRMED → VERIFYING_POSTCONDITION → FULFILLED_VERIFIED`. No single signal (a KeeperHub status string, a bare transaction-receipt status, Governor state alone, or a Transfer log's mere existence) can produce this result — `ReconciliationInput`'s type has no field capable of expressing any of those shortcuts (DEC-020). Live-proven: `evidence/marked-receipt/receipt.json`, `status: "FULFILLED_VERIFIED"`, reproduced identically across two separate process invocations. This is the first, and — as of Gate 6 — the only, legitimately-reached `FULFILLED_VERIFIED`/`MARKED ✓` in this project, for one controlled Sepolia test fixture, never a real DAO or mainnet action.

## What `MARKED ✓` requires

`MARKED ✓` is the human-facing label for the internal terminal status `FULFILLED_VERIFIED`. It requires **all** of the following to hold simultaneously — no subset is sufficient:

```text
MARKED ✓
requires:
- authorization agreement       (frozen hash == live Governor hash, re-checked pre-write)
- correct lifecycle call        (target + selector + stage args match the plan)
- final Governor state          (e.g. Executed, not merely Queued or a pending receipt)
- finality policy                (the inclusion block has passed the configured finality threshold)
- full required postcondition coverage (every REQUIRED assertion in the bundle passes; PARTIAL is never green)
```

A transaction receipt with `status == 1` is explicitly insufficient on its own (Invariant 11). If the lifecycle call succeeds on-chain but a required postcondition fails or is unsupported, the terminal status is `FULFILLED_UNVERIFIED`, not `FULFILLED_VERIFIED` — no green badge.

As of Gate 6, this is implemented, not just specified: `reconcileForMarkedReceipt` (`packages/core/src/receipt.ts`) is the single function every path to `FULFILLED_VERIFIED` passes through, and its input type has no field through which any single one of the above requirements — or a cheaper proxy for one, like a bare KeeperHub status string — could stand in for the whole. See `evidence/marked-receipt/reconciliation.md` for the live proof and DEC-020 for the design rationale.

## Named non-happy-path outcomes are first-class

Refusals, blocks, and reconciliation states are product results, not incidental error branches (Law 8). The complete named set is enumerated in `packages/core/src/status.ts` and mirrors PRD §10 exactly:

- `REFUSAL_TIMELOCK_PENDING` — waiting, not dead, for an armed AUTO job.
- `REFUSAL_CANCELED`, `REFUSAL_NOT_EXECUTABLE`, `REFUSAL_PAYLOAD_MISMATCH`, `REFUSAL_SIMULATION_REVERT`, `REFUSAL_WORKFLOW_POLICY_VIOLATION`.
- `DUPLICATE_SUPPRESSED` — a second attempt at the same work identity is suppressed, not re-executed.
- `BLOCKED_INSUFFICIENT_GAS`, `BLOCKED_CALLER_NOT_AUTHORIZED`.
- `UNKNOWN_RECONCILING` — ambiguous transport (e.g. a timeout with no confirmed receipt) enters reconciliation. It never causes a second semantic write, and it never rotates the idempotency key (Invariant 9, Invariant 36).
- `FULFILLED_EXTERNALLY_VERIFIED` / `FULFILLED_EXTERNALLY_UNVERIFIED` — someone else executed first. This is a valid user success case, verified independently, not raced against (Invariant 10).
- `FULFILLED_UNVERIFIED` — transaction succeeded, required postcondition did not (Invariant 14).
- `POSTCONDITION_UNSUPPORTED` — the action's semantics (e.g. fee-on-transfer, rebasing tokens, unmodeled callbacks) are not modeled; the run does not pretend otherwise.
- `DISARMED_BY_USER` — an authenticated operator disarmed before broadcast. After submission, disarm cannot pretend to cancel the chain transaction (J7.1).
- `CACTUS_RESOLUTION_FAILED`, `AUTHORIZATION_RESOLUTION_FAILED`.

## Work identity and idempotency

```text
marked:{chainId}:{governor}:{proposalId}:{stage}
```

One stage (queue or execute) equals one Marked work identity (Invariant 8). KeeperHub-level idempotency, where a surface documents it, is a short-term duplicate shield, not a permanent one (Invariant 36). After the documented replay window, Marked's own job state plus live Governor state are what prevent a duplicate semantic write — the work identity is never rotated to force a retry through ambiguity.

## Execution intent is explicit, never a default

```text
Marked never relies on a provider's default execution mode.
```

This was added mid-implementation after a real incident (Gate 1B, `evidence/keeperhub/incidents/001-omitted-simulate-executed.md`): a KeeperHub endpoint executed a real testnet transaction because a request omitted an optional `simulate` flag, and the provider's default for "flag absent" turned out to be "execute," not "refuse." Marked's own domain boundary must never reproduce that ambiguity, regardless of what any provider does:

- Simulation and execution are separate, differently-named operations at the Marked domain boundary (e.g. `simulateContractCall` / `executeContractCall`), never one operation with an optional boolean.
- Execution requires an explicit authorization object (`intent: "EXECUTE"` plus a frozen-request-hash binding) that simulation code has no way to construct.
- Every execution request is validated locally — chain supported, target explicit, calldata explicit, value explicit, request hash matches the frozen commitment, environment permits the chain, `ENABLE_MAINNET_WRITE` guard passes, intent is `EXECUTE` — before any network call. A failure at any check is a local refusal with zero network I/O, not a request sent and hoped-safe.
- Whatever a provider's own wire format expects (e.g. KeeperHub's `simulate: true`/omitted), that translation happens once, inside a dedicated provider-level serializer, covered by a test that inspects the literal serialized request — never left to be "whatever didn't get explicitly turned off."

## What this model is not

As of Gate 2, canonical encoding, keccak256 hashing, and a read-only Governor Bravo adapter are implemented and live-proven against Compound #220 (see `evidence/governor/`). As of Gate 3, the first `EconomicPostconditionAdapter` (`ERC20TransferAdapter`) is implemented and live-proven against a real historical mainnet transfer (see `evidence/postconditions/`) — narrowly: canonical `transfer(address,uint256)` only, `transferFrom`/fee-on-transfer/rebasing tokens explicitly unsupported and proven to fail closed. As of Gate 4, the `FulfillmentCommitment`, its hash, and the fail-closed state machine are implemented (`evidence/fulfillment-commitment/`). As of Gate 5, a real Governor lifecycle call is constructed, validated, and submitted through KeeperHub against a controlled Sepolia deployment (`evidence/lifecycle-fulfillment/`). As of Gate 6, the full reconciliation-to-receipt path is implemented and live-proven, reaching `FULFILLED_VERIFIED`/`MARKED ✓` for that one controlled object (`evidence/marked-receipt/`).

This document still does not implement: any Governor family other than Governor Bravo; any `EconomicPostconditionAdapter` other than `ERC20TransferAdapter`; a live Cactus→KeeperHub closed loop (Mode C, `DEC-015`, remains the claim boundary); any real DAO or mainnet fulfillment; a production persistence backend (`InMemoryFulfillmentJobStore` remains the only implementation); or a production UI. Treating any code that exists before its authorizing gate as proof of this model's behavior would violate BUILD_CONTRACT.md law 14 — and, symmetrically, treating the one proven `MARKED ✓` as evidence this model works for any object other than the exact one it was proven against would be the same error in the other direction.
