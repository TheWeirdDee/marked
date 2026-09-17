# Gate 1B controlled probe — ERC20 `approve()` on Sepolia WETH

This is the deliberate, authorized Gate 1B execution probe — **not** the accidental transfer in `evidence/keeperhub/incidents/001-omitted-simulate-executed.md`. It was performed only after: the safety redesign (separate `simulateContractCall`/`executeContractCall`, explicit authorization, full local validation) was implemented and tested; the real `/api/execute/contract-call` schema was researched from KeeperHub's actual source (`evidence/keeperhub/contract-call-schema.md`); a simulation-only run proved zero state mutation; and the frozen call, hash, and authorization were explicitly re-verified.

## What was called

`WETH9.approve(spender=0x000000000000000000000000000000000000dEaD, amount=1337)` on Ethereum Sepolia (`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`, verified as a real deployed contract with `symbol() == "WETH"` before use). Zero native value. A genuinely state-changing (non-view) function, chosen deliberately per `evidence/keeperhub/contract-call-schema.md`'s finding that a view/pure function would be routed to a plain read and never exercise simulate/execute at all.

## Sequence actually followed

1. **Simulation only** (`simulateContractCall`) — request inspected before sending (confirmed `simulate: true` present), sent, response recorded (`wouldRevert: false`).
2. **Independent state check**: `allowance(owner, spender)` read via a fresh `eth_call`, both before and after the simulation — `0` both times, proving zero mutation.
3. **Explicit re-verification** of the frozen request hash, target, chain, value, calldata, and authorization before proceeding (nothing here is a straight-through code path from simulation to execution — see `packages/keeperhub/src/client.ts`).
4. **Controlled execution** (`executeContractCall`, with a matching `ExplicitExecutionAuthorization`) — landed as tx `0x674e6ee957e8d2470e8120cad36f0e3325309d158b364a76d9c3f0aa023f95be`, `status: completed`.
5. **Independent on-chain verification**: transaction and receipt fetched directly via public RPC (not trusted from KeeperHub's response alone); `allowance(owner, spender)` re-read and confirmed `1337`, exactly the authorized amount.
6. **Idempotency experiment**: the identical `FrozenContractCall` + `ExplicitExecutionAuthorization` (same `Idempotency-Key`, derived from the same request hash) sent a second time — KeeperHub returned the identical `executionId`/`transactionHash` with `idempotentReplay: true`. `allowance` re-read afterward: still `1337`, confirming no second transaction was broadcast.

## Why this satisfies Gate 1B's execution proof (and the accidental transfer does not)

- Deliberate, not accidental — every field was chosen and reviewed before the request was built, not discovered by omission.
- Simulated first, with the simulation's zero-mutation property independently verified on-chain, not merely trusted from the response.
- Used the actual safety-redesigned code path (`executeContractCall` with `ExplicitExecutionAuthorization`), the same path any future Marked commitment would use — not a raw exploratory `fetch` call.
- Produced additional, genuinely new evidence: the `Approval` event resolves the open `msg.sender` question in `wallet-model.md`, and the replay resolves idempotency — neither of which the accidental transfer (a self-transfer with no third-party contract and no deliberate replay) could have shown.

## Files

- `input.json` — the exact `FrozenContractCall` used.
- `simulation-response.json` — the simulation result.
- `execution-response.json` — the real execution result.
- `idempotency-replay-response.json` — the deliberate replay result.
- `onchain-verification.json` — everything independently re-derived from public RPC calls, not taken on KeeperHub's word.
