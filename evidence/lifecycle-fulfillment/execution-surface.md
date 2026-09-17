# Gate 5's use of the locked execution surface

See root `EXECUTION_SURFACE.md` and `DEC-019` for the full Option A/B decision record. This file documents Gate 5's specific exercise of it.

## What Gate 5 used

`POST https://app.keeperhub.com/api/execute/contract-call`, via `packages/keeperhub`'s already-proven `simulateContractCall` / `executeContractCall` — the exact same functions Gate 1B proved, unmodified. Gate 5 adds no new KeeperHub wire logic; it only adds Governor-lifecycle-specific *callers* of that existing, proven client (lifecycle eligibility, execution plan construction, caller-authority evaluation, policy validation — all in `packages/governor` and `packages/keeperhub/src/lifecycle-execution-policy.ts`).

## Sender / relayer addresses (cross-checked against Gate 1B)

| Role | Address | Consistency check |
|---|---|---|
| KeeperHub org wallet (`msg.sender` inside the called contract) | `0xeecbc82818e591b92e6dd54aa7589b0b9fed6160` | Matches `evidence/keeperhub/wallet-model.md` exactly. |
| Relayer/sponsor address (real transaction's `from`) | `0xa17cb6adb58277e5b4a44b8c1ecb449bb6614e87` | Matches `EXECUTION_SURFACE.md`'s Gate 1B-documented relayer address exactly — `transaction-receipt.json`'s `from` field. |

## `receipt.to` does not equal the Governor address — expected, not a defect

The real transaction's top-level `to` is `0x5af5194b4b0909eb978e3cf1e25333852277f07d`, not the Governor (`0xe86cdc53f3c4f416be42f13f621be96ab9d30727`). This is the expected behavior of KeeperHub's EIP-7702 account-abstraction model (the wallet EOA's delegated code / relayer entry point is the top-level target, not the ultimately-called contract) — already documented in Gate 1B's `evidence/keeperhub/wallet-model.md`. It is **not** evidence that the wrong contract was called.

The authoritative confirmation is the event log, independently decoded in this session (topic0 hashes computed directly, not assumed):

| logIndex | Emitting contract | Event | Confirms |
|---|---|---|---|
| 237 | GovernanceToken (`0x0136dcdc...`) | `Transfer(Timelock, recipient, 1000e18)` | The exact authorized token movement occurred |
| 238 | Timelock (`0x9959e1c4...`) | `ExecuteTransaction(...)` | The Timelock's own `executeTransaction` ran — called by the Governor internally, never by Marked/KeeperHub directly |
| 239 | **Governor** (`0xe86cdc53...`) | `ProposalExecuted(2)` | KeeperHub's call reached and completed the Governor's own `execute(2)` |

All three event-signature hashes (`keccak256` of the canonical event signatures) were computed directly in this session and matched against the receipt's `topics[0]` values byte-for-byte — not assumed from memory.

## No direct target execution occurred

`validateLifecycleExecutionPolicy` was run twice (once before approval, once immediately before broadcast) and both times confirmed `proposedCall.contractAddress` was the Governor, never the token or Timelock directly. The real transaction's `to` (the entry point) and the Governor's own internal call (proven by its own `ProposalExecuted` event) together confirm this held true for the real broadcast, not just the local policy check.
