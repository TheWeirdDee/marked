# Cross-gate regression — Gate 4

Per Gate 4 instructions §13. Re-run after all Gate 4 implementation work, 2026-09-15.

## Cactus fixtures still resolve

`packages/cactus` test suite: 48/48 passing, unchanged from before Gate 4. No Gate 4 code touches `packages/cactus`.

## Gate 2 — Compound #220 authorization hash unchanged

```text
0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d
```

Confirmed two ways:
1. `pnpm prove:governor` re-run directly — identical hash.
2. `pnpm prove:fulfillment-commitment` — which itself live-resolves Compound #220 as part of building its example commitment — prints an explicit `[Gate 2 regression] PASS` line and records `gate2RegressionPass: true` in `evidence/fulfillment-commitment/proof.json`.

`packages/governor` test suite: 40/40 passing, unchanged from before Gate 4.

## Gate 3 — historical ERC20 fixture still reproduces

`pnpm prove:erc20-postcondition` re-run after all Gate 4 changes: identical result to the original Gate 3 run —

```text
Recipient balance before: 1156027789181
Recipient balance after: 1216027789181
Observed delta: 60000000000
Adapter reason: EXACT_MATCH
ADAPTER VERIFICATION: PASS
```

`packages/postconditions` test suite: 58/58 passing (53 pre-existing Gate 3 tests + 5 new Gate 4 `postcondition-binding.test.ts` tests), no pre-existing test modified.

## KeeperHub safety wrappers/tests remain green

`packages/keeperhub` test suite: 57/57 passing, unchanged from before Gate 4. **No new KeeperHub transaction was sent** — Gate 4 does not call `packages/keeperhub` at all; existing Gate 1B evidence (`evidence/keeperhub/`) was not touched, per Gate 4 instructions §13's explicit prohibition on re-testing Gate 1B with a fresh transaction.

## No local broadcaster introduced

Confirmed by inspection and by test: `armFulfillmentJob`, `disarmFulfillmentJob`, and `approveFulfillmentJob` are synchronous functions that accept no network client, provider, or signer of any kind — see `evidence/fulfillment-commitment/mutation-tests.md` items 28-29. No new file in this gate imports `viem`'s wallet/signing primitives or any HTTP client library for writing.

## Full repository validation

`pnpm typecheck` ✓ (11/11 workspaces, `packages/db` now included since it gained tests) · `pnpm lint` ✓ · `pnpm test` ✓ 350/350 · `pnpm build` ✓.

## Test totals

| Package | Before Gate 4 | After Gate 4 |
|---|---|---|
| `packages/core` | 33 | 124 |
| `packages/postconditions` | 53 | 58 |
| `packages/db` | 0 (no test script) | 10 |
| `packages/governor` | 40 | 40 (unchanged) |
| `packages/cactus` | 48 | 48 (unchanged) |
| `packages/keeperhub` | 57 | 57 (unchanged) |
| `apps/cli` | 5 | 5 (unchanged) |
| `packages/config` | 8 | 8 (unchanged) |
| **Repo total** | **244** | **350** |
