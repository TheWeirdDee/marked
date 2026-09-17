# Marked — KeeperHub Execution Surface

This document records the actual KeeperHub execution surface Marked uses. It is not a design preference document — it is evidence-driven and only changes when a gate produces evidence. See PRD v1.2 §9.

## Current status

STATUS: **LOCKED — Option B**, as of Gate 5 (see DEC-019). Gate 1B proved Option B (direct execute) works, live, with good properties; Gate 5 proved it carries a real Governor lifecycle execution (`execute(proposalId)` on a controlled Sepolia Governor Bravo deployment) end to end. **Option A (workflow-based) remains untested and is explicitly deferred**, not chosen by default inertia — this is a deliberate decision, not an absence of one.

## Deferred: Option A (workflow-based)

The KeeperHub workflow itself would contain the Governor or Timelock lifecycle write. Trigger and conditions would be load-bearing parts of the workflow. Status and `transactionHashes` would follow the workflow-run contract, not a direct-call contract. **Not tested in Gate 1B or Gate 5.** Gate 1C's read-only research (`evidence/closed-loop/workflow-research.md`) found no write-capable node type in any workflow this account can see — only trigger/read/condition/notify nodes were observed. This neither confirms nor rules out Option A's viability. Workflows may later become an orchestration enhancement layered on top of Option B (e.g. trigger/condition logic wrapping the same direct-execute call), but that is future, unproven work — not claimed here.

## Option B — direct `execute_contract_call` (`POST /api/execute/contract-call`) — tested and proven functional

Live-tested in Gate 1B via `packages/keeperhub` (`simulateContractCall` / `executeContractCall`), against a genuinely state-changing ERC20 `approve()` call on Sepolia — see `evidence/keeperhub/probe-001-erc20-approve/`:

- **Blocking simulation**: `simulate: true` runs `estimateGas` + `call` against live state, returns `wouldRevert`/`gasEstimate`/`simulatedReturnValue`, never broadcasts. Independently confirmed zero state mutation.
- **Idempotency**: an `Idempotency-Key` header (derived from a deterministic request hash) causes an identical repeat request to return the cached original response (`idempotentReplay: true`, same `executionId`/`transactionHash`) rather than broadcasting again. Independently confirmed via on-chain state (no second mutation).
- **Real execution**: landed a real Sepolia transaction, `status: 0x1`, independently re-verified via public RPC (not trusted from KeeperHub's response alone).

This satisfies the "better blocking simulation and documented idempotency" bar PRD §9 sets for Option B. Whether Option A also meets or exceeds this bar remains unknown and unmeasured — Option B is locked because it is proven, not because it was compared against and won.

## Gate 5 — Option B proven for a real Governor lifecycle write

`packages/governor`'s `execute(proposalId)` plan, built and validated entirely within the proven Option B surface, was submitted through KeeperHub against a controlled Sepolia Governor Bravo deployment: tx `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`, `status: success`. The Governor's own `ProposalExecuted(2)` event, the Timelock's own `ExecuteTransaction` event, and the token's own `Transfer` event all appear in the same receipt, confirming the call cascaded correctly through the authority-preserving chain (KeeperHub → Governor.execute → Timelock.executeTransaction → token.transfer) with no direct call to any underlying target. See `evidence/lifecycle-fulfillment/`.

## Forbidden regardless of option chosen

- Mixing status parsers between the workflow-run contract and the direct-execution contract.
- Claiming private routing without evidence from the selected action.
- Treating workflow `success` as `MARKED ✓` — `MARKED ✓` additionally requires postcondition verification (see `packages/core/reference/fulfillment-model.md`).
- Using `execute_protocol_action` for the Governor write if it ignores `simulate`. **Confirmed as a real, currently-open issue** in KeeperHub's own tracker (GitHub issue #2334, "closed as not planned"): the `app/api/execute/[...slug]/route.ts` catch-all "protocol actions" route contains zero `simulate`-flag parsing and broadcasts regardless of the flag. This is not hypothetical — Marked must never route the Governor write (or any write) through that catch-all path. `POST /api/execute/contract-call` (used in Gate 1B) is a separate, properly `simulate`-gated route and is unaffected by this issue.
- Any local fallback broadcaster (a `writeContract` call outside of KeeperHub) standing in for KeeperHub on any run labeled KeeperHub-executed. **Confirmed never present** in `packages/keeperhub` — every execution path goes through `postToKeeperHub`.

## Fields recorded from Gate 1B (Option B only)

| Field | Value |
|---|---|
| Option chosen (A or B) | **Option B — locked as of Gate 5 (DEC-019).** Option A untested and explicitly deferred. |
| KeeperHub tool name(s) used | REST: `POST https://app.keeperhub.com/api/execute/contract-call` (both simulate and execute modes) |
| Status field(s) read | Simulation: `success`, `wouldRevert`, `gasEstimate`, `simulatedReturnValue`. Execution: `executionId`, `status`, `transactionHash`, `transactionLink`, `idempotentReplay` |
| Idempotency window | Not bounded/measured in this gate — only proven to hold across two requests sent seconds apart. See Invariant 36: not treated as permanent duplicate protection regardless. |
| First real testnet write evidence | `evidence/keeperhub/probe-001-erc20-approve/` — tx `0x674e6ee957e8d2470e8120cad36f0e3325309d158b364a76d9c3f0aa023f95be` |
| Sender address (Turnkey-managed) | `0xeecbc82818e591b92e6dd54aa7589b0b9fed6160` (org wallet, EIP-7702-delegated — see `evidence/keeperhub/wallet-model.md`). Submitted on-chain via a relayer/sponsor address (`0xa17cb6adb58277e5b4a44b8c1ecb449bb6614e87`), but a called contract sees `msg.sender` as the wallet's own address, not the relayer's — proven via the `Approval` event. |
| Simulation / `eth_call` preflight mechanism | KeeperHub-native: `simulate: true` on the same endpoint, not a separate Marked-side `eth_call`. |

## Notes

- Work identity format is fixed regardless of surface choice: `marked:{chainId}:{governor}:{proposalId}:{stage}` (PRD §8.12). Not yet wired into `packages/keeperhub`'s idempotency key — the current key is a request-content hash (`hashContractCall`), not this work-identity string; reconciling the two is later-gate work.
- KeeperHub idempotency, on whatever surface is chosen, is not treated as permanent duplicate protection (Invariant 36). After the documented replay window, Marked job state plus Governor state are the duplicate shield.
- Raw calldata support (`data` field, GitHub PR #2449) is merged to staging only, not production — confirmed live. `packages/keeperhub` decodes calldata locally instead; see DEC-014.
- This file was updated by Gate 1B for Option B only, then formally locked to Option B by Gate 5 (DEC-019). Option A (workflow-based execution) evaluation remains explicitly deferred, not silently abandoned.
- **Gate 1C addendum**: read-only research into whether current KeeperHub workflows could express a Governor lifecycle write (`evidence/closed-loop/workflow-research.md`) found no write-capable node type in any workflow this account can see — only trigger/read/condition/notify nodes were observed. This neither confirms nor rules out Option A's viability; it remains untested.
- **Gate 5**: removing KeeperHub from this Option B surface removes Marked's only managed execution capability — there is no local fallback broadcaster anywhere in this repository (confirmed again in Gate 5; `armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob` are synchronous and touch no client). Marked does not, and must not, implement one.
