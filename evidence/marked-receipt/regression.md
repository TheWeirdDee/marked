# Cross-gate regression — Gate 6

Re-run after all Gate 6 implementation and the live verification, 2026-09-16.

## Gate 2 — Compound #220 authorization hash unchanged

```text
0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d
```

`pnpm prove:governor` re-run — identical.

## Gate 3 — historical ERC20 fixture still reproduces

`pnpm prove:erc20-postcondition` re-run — identical (`EXACT_MATCH`, `ADAPTER VERIFICATION: PASS`). `ERC20TransferAdapter` itself was not modified by Gate 6 — reused exactly as Gate 3 left it.

## Gate 4 — fulfillment commitment example still reproduces

`pnpm prove:fulfillment-commitment` re-run — identical hash (`0x77c70a19f9a2910823e34416b30790c2e683bf2a889d02c414b211cc0fa49358`).

## Gate 5 — the fulfillment object remains intact

Not re-executed (per explicit instruction: no new proposal, no new Governor, no new KeeperHub transaction). Instead, Gate 6's own independent re-resolution **is** the regression check: the Governor still reports `state(2) = Executed`, the action authorization hash is unchanged, and the recipient's balance still reflects the original transfer — all confirmed fresh in this gate's live run.

## Full repository validation

`pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` ✓ 399/399 · `pnpm build` ✓.

## Test totals

| Package | Before Gate 6 | After Gate 6 |
|---|---|---|
| `packages/core` | 124 | 140 (+16: `receipt.test.ts`) |
| `packages/governor` | 64 | 64 (unchanged) |
| `packages/keeperhub` | 66 | 66 (unchanged) |
| `packages/postconditions` | 58 | 58 (unchanged) |
| `packages/db` | 10 | 10 (unchanged) |
| `packages/cactus` | 48 | 48 (unchanged) |
| `apps/cli` | 5 | 5 (unchanged) |
| `packages/config` | 8 | 8 (unchanged) |
| **Repo total** | **383** | **399** |

## Safety

Zero mainnet writes, zero new testnet writes, zero new KeeperHub calls, zero new token transfers, zero new proposals, zero new Governor deployments. `gate6-verify-economic-postcondition.ts` performs only RPC reads (`readContract`, `getBlock` implicitly via viem) — no `writeContract`, no `sendTransaction`, no signing key of any kind is referenced anywhere in the script.
