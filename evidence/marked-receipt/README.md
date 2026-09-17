# Gate 6 evidence — the first Marked Receipt

**MARKED ✓.** The first, and — as of this gate — the only, legitimately-reached terminal `FULFILLED_VERIFIED` state in this project, produced by full reconciliation of every required truth, never by trusting any single signal.

```text
status: FULFILLED_VERIFIED
receiptHash: 0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4
```

## What this receipt attests to

For the exact Gate 5 fulfillment object (controlled Sepolia Governor `0xe86cdc53f3c4f416be42f13f621be96ab9d30727`, proposal `2`, execution tx `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`):

- The Governor's authorized action, **independently re-resolved right now** via the unmodified Gate 2 engine, still hashes to exactly the frozen authorization (`0x2fe3f808910a5d89ff9d233d34ecd53fe66d89d3ce46e340891599e784167a3b`) — matching both the hash Gate 5 recorded at execution time and a brand-new resolution performed in this gate.
- The authorized economic action, **decoded fresh from that live Governor calldata** (never read from Gate 5's saved JSON, never hardcoded): `transfer(0xF02789155998f85D3a0b7dcA1525b059988Ab442, 1000000000000000000000)` on token `0x0136DCDC97d0314Feb27c40b4f4671c9F616f51F`.
- The economic result, **independently verified** via the unmodified Gate 3 `ERC20TransferAdapter` against fresh block-pinned RPC reads: recipient balance delta exactly `1000000000000000000000`, corroborated by the token's own `Transfer` log bound to the exact execution transaction — `reason: EXACT_MATCH`.
- The Governor's final state, **independently re-read**: `state(2) = 7 (Executed)`.
- A bonus, non-required corroboration: the source of funds (the Timelock, identified by reading `Governor.timelock()` live — never guessed) lost exactly the amount the recipient gained.

Every one of these facts had to independently agree — see `reconciliation.md` for why no subset of them, alone, could have produced this result.

## Files in this directory

| File | Contents |
|---|---|
| `README.md` | This file |
| `reconciliation.md` | The core terminal invariant, why each single-signal shortcut is insufficient, and the proof that this run didn't take one |
| `regression.md` | Cross-gate regression results |
| `authorization-final.json` | The fresh Gate 2 re-resolution performed in this gate |
| `postcondition-verification.json` | The fresh Gate 3 `ERC20TransferAdapter` run (pre-state, expected, observed, evidence) |
| `source-balance.json` | Bonus Timelock balance corroboration |
| `reconciliation.json` | The reconciliation function's exact output |
| `receipt.json` | The `MarkedReceipt` object |
| `proof.json` | The complete, structured result of the live verification script |

## Reproducing this

```bash
pnpm verify:gate6
```

Read-only. No new proposal, no new Governor, no new KeeperHub call, no new token transfer — reproduced twice in this session as two fully separate process invocations, both producing the identical `receiptHash` (`0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`). Every fact above is independently re-derivable from the already-permanent Sepolia state at the addresses/tx hash listed — nothing here depends on Gate 5's evidence files being trusted as anything more than "which object to look at."
